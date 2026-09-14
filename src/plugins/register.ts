import { MDFolderTree } from '../MDFolderTree';
import { TypesPlugin } from './TypesPlugin';
import { CheckboxPlugin } from './CheckboxPlugin';
import { SearchPlugin } from './SearchPlugin';
import { ChangedPlugin } from './ChangedPlugin';
import { ConditionalSelectPlugin } from './ConditionalSelectPlugin';
import { WholerowPlugin } from './WholerowPlugin';
import { SortPlugin } from './SortPlugin';
import { UniquePlugin } from './UniquePlugin';
import { StatePlugin } from './StatePlugin';
import { ContextMenuPlugin } from './ContextMenuPlugin';
import { DndPlugin } from './DndPlugin';
import { MassloadPlugin } from './MassloadPlugin';

/**
 * Registers the built-in plugins under the names jstree knows them by.
 * Importing this module for its side effect is what makes those names work:
 * the core itself constructs no plugin, so a consumer who imports
 * `MDFolderTree` alone can leave every plugin out of their bundle. Both
 * package entries import it, as does the test setup, so the names are there
 * for anyone taking the package as it ships.
 *
 * The order registered means nothing -- a tree applies plugins in the order
 * its own `plugins` config lists them.
 */
MDFolderTree.registerPlugin('types', () => new TypesPlugin());
MDFolderTree.registerPlugin('checkbox', () => new CheckboxPlugin());
MDFolderTree.registerPlugin('search', () => new SearchPlugin());
MDFolderTree.registerPlugin('changed', () => new ChangedPlugin());
MDFolderTree.registerPlugin('conditionalselect', () => new ConditionalSelectPlugin());
MDFolderTree.registerPlugin('wholerow', () => new WholerowPlugin());
MDFolderTree.registerPlugin('sort', () => new SortPlugin());
MDFolderTree.registerPlugin('unique', () => new UniquePlugin());
MDFolderTree.registerPlugin('state', () => new StatePlugin());
MDFolderTree.registerPlugin('contextmenu', () => new ContextMenuPlugin());
MDFolderTree.registerPlugin('dnd', () => new DndPlugin());
MDFolderTree.registerPlugin('massload', () => new MassloadPlugin());
