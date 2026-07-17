/* Scout: open-access art sources (CC0 / public domain). */

export async function scoutMet(term) {
  const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(term)}`);
  const j = await r.json();
  const ids = (j.objectIDs || []).sort(() => Math.random() - 0.5).slice(0, 10);
  const metas = await Promise.all(ids.map((id) =>
    fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`).then((r) => r.json()).catch(() => null)));
  return metas.filter((m) => m && m.primaryImageSmall && m.isPublicDomain).map((m) => ({
    src: m.primaryImageSmall, full: m.primaryImage || m.primaryImageSmall, title: m.title,
    artist: m.artistDisplayName || "Unknown", url: m.objectURL, source: "The Met · CC0",
  }));
}

export async function scoutAIC(term) {
  const r = await fetch(`https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(term)}&limit=10&fields=id,title,image_id,artist_title,is_public_domain`);
  const j = await r.json();
  return (j.data || []).filter((a) => a.image_id && a.is_public_domain !== false).map((a) => ({
    src: `https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg`,
    full: `https://www.artic.edu/iiif/2/${a.image_id}/full/1686,/0/default.jpg`,
    title: a.title, artist: a.artist_title || "Unknown",
    url: `https://www.artic.edu/artworks/${a.id}`, source: "Art Institute Chicago · CC0",
  }));
}
