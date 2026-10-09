const DEFAULT_MAX_CHARACTERS = 6000;

export function splitReviewSource(source: string, maxCharacters = DEFAULT_MAX_CHARACTERS) {
  const paragraphs = source.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  paragraphs.forEach((paragraph) => {
    if (paragraph.length > maxCharacters) {
      pushCurrent();
      for (let offset = 0; offset < paragraph.length; offset += maxCharacters) {
        chunks.push(paragraph.slice(offset, offset + maxCharacters));
      }
      return;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxCharacters) pushCurrent();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  });
  pushCurrent();
  return chunks;
}
