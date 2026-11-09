// Tipos de bloque admitidos por js/ui/blocks.js (ese módulo usa el DOM y no se puede importar en Node).
// tests/pwa.test.mjs comprueba que esta lista coincide con la del renderizador.
export const BLOCK_TYPES_LIST = ['text', 'code', 'cmds', 'flow', 'compare', 'tree', 'callout', 'reveal', 'chat', 'video'];
