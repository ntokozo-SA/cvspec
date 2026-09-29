import * as cdk from 'aws-cdk-lib'
import { CvSpecStack } from '../lib/cvspec-stack'

const app = new cdk.App()

new CvSpecStack(app, 'CvSpec', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: app.node.getContext('region'),
  },
  secretName: app.node.getContext('secretName'),
  supabaseUrl: app.node.getContext('supabaseUrl'),
  openaiModel: app.node.getContext('openaiModel'),
})
