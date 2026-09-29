import * as path from 'node:path'
import * as cdk from 'aws-cdk-lib'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Platform } from 'aws-cdk-lib/aws-ecr-assets'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import type { Construct } from 'constructs'

const API_PORT = 3001
const SECRET_KEYS = [
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'RESUMEPARSER_API_KEY',
] as const

export interface CvSpecStackProps extends cdk.StackProps {
  secretName: string
  supabaseUrl: string
  openaiModel: string
}

export class CvSpecStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CvSpecStackProps) {
    super(scope, id, props)

    const clientDist = path.join(__dirname, '../../client/dist')
    const appSecret = secretsmanager.Secret.fromSecretNameV2(this, 'AppSecret', props.secretName)

    // No NAT gateway: tasks sit in public subnets with a public IP for outbound calls
    // (Supabase, OpenAI, ECR). The ALB is internal and only reachable via CloudFront.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
          mapPublicIpOnLaunch: false,
        },
        { name: 'private', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    })

    const cloudFrontOriginFacing = ec2.PrefixList.fromLookup(this, 'CloudFrontOriginFacing', {
      prefixListName: 'com.amazonaws.global.cloudfront.origin-facing',
    })

    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      description: 'Internal ALB, CloudFront VPC origin only',
      allowAllOutbound: false,
    })
    albSg.addIngressRule(
      ec2.Peer.prefixList(cloudFrontOriginFacing.prefixListId),
      ec2.Port.tcp(80),
      'CloudFront origin-facing',
    )

    const serviceSg = new ec2.SecurityGroup(this, 'ServiceSg', {
      vpc,
      description: 'CV Specs API tasks',
      allowAllOutbound: false,
    })
    serviceSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS APIs and job links')
    serviceSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Plain HTTP job links')

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc })

    const logGroup = new logs.LogGroup(this, 'ApiLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'ApiTask', {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    })

    taskDefinition.addContainer('api', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../server'), {
        platform: Platform.LINUX_AMD64,
      }),
      portMappings: [{ containerPort: API_PORT }],
      environment: {
        NODE_ENV: 'production',
        PORT: String(API_PORT),
        SUPABASE_URL: props.supabaseUrl,
        OPENAI_MODEL: props.openaiModel,
      },
      secrets: Object.fromEntries(
        SECRET_KEYS.map((key) => [key, ecs.Secret.fromSecretsManager(appSecret, key)]),
      ),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'api', logGroup }),
    })

    const service = new ecs.FargateService(this, 'ApiService', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [serviceSg],
      circuitBreaker: { enable: true, rollback: true },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    })

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroup: albSg,
      idleTimeout: cdk.Duration.seconds(120),
      dropInvalidHeaderFields: true,
    })

    const listener = alb.addListener('Http', { port: 80, open: false })
    listener.addTargets('Api', {
      port: API_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
      },
    })

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // Custom error responses would also rewrite API 404s, so SPA routing is done here instead.
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var lastSegment = request.uri.split('/').pop();
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}`),
    })

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'CV Specs',
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          { function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: origins.VpcOrigin.withApplicationLoadBalancer(alb, {
            httpPort: 80,
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            readTimeout: cdk.Duration.seconds(60),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    })

    // Hashed build assets are immutable; everything else (index.html, sw.js, manifest)
    // must revalidate so new releases and the PWA service worker update promptly.
    const assetsDeployment = new s3deploy.BucketDeployment(this, 'DeployAssets', {
      sources: [s3deploy.Source.asset(clientDist)],
      destinationBucket: siteBucket,
      exclude: ['*'],
      include: ['assets/*'],
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
      prune: false,
      memoryLimit: 512,
    })

    const shellDeployment = new s3deploy.BucketDeployment(this, 'DeployShell', {
      sources: [s3deploy.Source.asset(clientDist)],
      destinationBucket: siteBucket,
      exclude: ['assets/*'],
      cacheControl: [s3deploy.CacheControl.fromString('no-cache')],
      prune: false,
      memoryLimit: 512,
      distribution,
      distributionPaths: ['/*'],
    })
    shellDeployment.node.addDependency(assetsDeployment)

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` })
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId })
    new cdk.CfnOutput(this, 'ClusterName', { value: cluster.clusterName })
    new cdk.CfnOutput(this, 'ServiceName', { value: service.serviceName })
    new cdk.CfnOutput(this, 'ApiLogGroup', { value: logGroup.logGroupName })
  }
}
