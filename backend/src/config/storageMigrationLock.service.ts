import { ConflictException, Injectable } from "@nestjs/common";

@Injectable()
export class StorageMigrationLockService {
  private readonly lockedShareIds = new Set<string>();

  lock(shareId: string) {
    this.lockedShareIds.add(shareId);
  }

  unlock(shareId: string) {
    this.lockedShareIds.delete(shareId);
  }

  isLocked(shareId: string) {
    return this.lockedShareIds.has(shareId);
  }

  assertShareIsNotLocked(shareId: string) {
    if (!this.isLocked(shareId)) return;

    throw new ConflictException(
      "This share is currently being moved to another storage path",
    );
  }
}
