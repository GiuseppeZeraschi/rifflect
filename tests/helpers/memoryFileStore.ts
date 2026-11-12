import type { FileStore } from '@/data/files/fileStore';

/** In-memory FileStore for tests. Files are a map of URI → size; directories are a set of URIs. */
export class MemoryFileStore implements FileStore {
  readonly documentUri = 'file:///data/user/0/com.rifflect.app/files/';
  readonly cacheUri = 'file:///data/user/0/com.rifflect.app/cache/';
  readonly files = new Map<string, number>();
  readonly dirs = new Set<string>();
  freeBytes = 10 * 1024 ** 3;

  private norm(uri: string) {
    return uri.replace(/\/+$/, '');
  }

  addFile(uri: string, size: number) {
    this.files.set(this.norm(uri), size);
    let parent = this.norm(uri).replace(/\/[^/]+$/, '');
    while (parent.length > 'file://'.length) {
      this.dirs.add(parent);
      parent = parent.replace(/\/[^/]+$/, '');
    }
  }

  exists(uri: string) {
    const u = this.norm(uri);
    return this.files.has(u) || this.dirs.has(u);
  }
  ensureDir(uri: string) {
    this.dirs.add(this.norm(uri));
  }
  deleteDir(uri: string) {
    const u = this.norm(uri);
    for (const k of [...this.files.keys()]) if (k === u || k.startsWith(u + '/')) this.files.delete(k);
    for (const k of [...this.dirs]) if (k === u || k.startsWith(u + '/')) this.dirs.delete(k);
  }
  deleteFile(uri: string) {
    this.files.delete(this.norm(uri));
  }
  dirSizeBytes(uri: string) {
    const u = this.norm(uri) + '/';
    let total = 0;
    for (const [k, size] of this.files) if (k.startsWith(u)) total += size;
    return total;
  }
  fileSizeBytes(uri: string) {
    return this.files.get(this.norm(uri)) ?? 0;
  }
  freeDiskBytes() {
    return this.freeBytes;
  }
}
