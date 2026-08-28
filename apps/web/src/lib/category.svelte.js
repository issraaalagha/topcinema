// Shared category state (Svelte 5 runes module) — used by the header nav
// and the home page so categories live in the top navigation like Netflix.

export const category = $state({ value: '' });

export function setCategory(v) {
  category.value = v || '';
}
