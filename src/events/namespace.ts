/**
 * The event namespace. It is part of every event type this library dispatches
 * -- `select_node.MDFolderTree`, not a jQuery-style filter on a bare name --
 * so it is a compatibility contract with consumers, and is declared here
 * once rather than in each module that emits.
 */
export const EVENT_NS = 'MDFolderTree';
