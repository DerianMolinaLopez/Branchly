import { commands } from './bindings';
import { unwrap } from './client';

export const tagsApi = {
  list: (repoId: string) => unwrap(commands.listTags(repoId)),
  create: (repoId: string, name: string, target: string, message: string | null) =>
    unwrap(commands.createTag(repoId, name, target, message)),
  remove: (repoId: string, name: string) => unwrap(commands.deleteTag(repoId, name)),
};
