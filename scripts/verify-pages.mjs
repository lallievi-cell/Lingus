/** Read back the real published artifact. A pushed commit alone is not a deployment. */
const [siteUrl, expectedSha] = process.argv.slice(2);
if (!siteUrl || !/^[a-f\d]{40}$/i.test(expectedSha ?? '')) {
  throw new Error('Usage: node scripts/verify-pages.mjs <published-url> <commit-sha>');
}
const site = new URL(siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`);
if (!['http:', 'https:'].includes(site.protocol)) throw new Error('Expected a web URL');
let lastError;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const manifestUrl = new URL('build.json', site);
    manifestUrl.searchParams.set('release', expectedSha);
    const manifestResponse = await fetch(manifestUrl, {
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (!manifestResponse.ok) throw new Error(`Build metadata returned ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    if (manifest.commit !== expectedSha)
      throw new Error(`Published build is ${manifest.commit}, expected ${expectedSha}`);
    const htmlResponse = await fetch(new URL(`?release=${expectedSha}`, site), {
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (!htmlResponse.ok) throw new Error(`Page returned ${htmlResponse.status}`);
    const html = await htmlResponse.text();
    const script = html.match(/<script[^>]+src="([^"]+)"/);
    if (!script) throw new Error('Published entry script was not found');
    if (
      typeof manifest.entryFile !== 'string' ||
      !new URL(script[1], site).pathname.endsWith(`/${manifest.entryFile}`)
    ) {
      throw new Error('The page and its build metadata are not the same release yet');
    }
    for (const path of [script[1], 'art/valley-natural-atlas.png']) {
      const response = await fetch(new URL(path, site), {
        method: 'HEAD',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Published asset ${path} returned ${response.status}`);
    }
    console.log(`Verified Lingus ${manifest.version}, commit ${manifest.commit}, at ${site}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 11) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
throw lastError;
