// jsdom has no layout, no DataTransfer and a read-only `files`; these stand-ins cover what
// the form filler relies on.

function fileList(files: File[]): FileList {
  return Object.assign([...files], {
    item: (index: number) => files[index] ?? null,
  }) as unknown as FileList
}

Element.prototype.getClientRects = function getClientRects(this: Element) {
  for (
    let element: Element | null = this as Element | null;
    element;
    element = element.parentElement
  ) {
    if (element instanceof HTMLElement && (element.hidden || element.style.display === 'none')) {
      return [] as unknown as DOMRectList
    }
  }
  return [{}] as unknown as DOMRectList
}

const attachedFiles = new WeakMap<HTMLInputElement, FileList>()
Object.defineProperty(HTMLInputElement.prototype, 'files', {
  configurable: true,
  get(this: HTMLInputElement) {
    return attachedFiles.get(this) ?? fileList([])
  },
  set(this: HTMLInputElement, value: FileList) {
    attachedFiles.set(this, value)
  },
})

class TestDataTransfer {
  private readonly added: File[] = []
  readonly items = {
    add: (file: File) => {
      this.added.push(file)
    },
  }
  get files(): FileList {
    return fileList(this.added)
  }
}
;(globalThis as Record<string, unknown>).DataTransfer = TestDataTransfer

if (typeof globalThis.CSS === 'undefined' || typeof globalThis.CSS.escape !== 'function') {
  ;(globalThis as Record<string, unknown>).CSS = {
    escape: (value: string) => value.replace(/([^\w-])/g, '\\$1'),
  }
}
