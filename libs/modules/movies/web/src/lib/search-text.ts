/** What is left of a shared text to search a film by: no links ("Dune — Netflix https://…"). */
export function searchText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
