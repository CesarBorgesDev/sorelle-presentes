export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function extractXmlTag(xml, tag) {
  if (!xml || !tag) return null;
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}>([^<]*)</(?:[\\w-]+:)?${tag}>`, 'i');
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

export function extractAllXmlTags(xml, tag) {
  if (!xml || !tag) return [];
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}>([^<]*)</(?:[\\w-]+:)?${tag}>`, 'gi');
  const values = [];
  let match = re.exec(xml);
  while (match) {
    values.push(match[1].trim());
    match = re.exec(xml);
  }
  return values;
}
