import Script from "next/script";
import { connection } from "next/server";

// Evolus chat widget for the "Gara Facile Assistant" agent. The wgt_ token is public
// (no secret reaches the browser) and the widget is restricted to our domains in Evolus.
// Read at request time so the Docker image does not bake in the build-time value.
// lazyOnload: this component streams in behind <Suspense>, after the initial render where
// next/script collects afterInteractive scripts, so afterInteractive was only preloaded.
export async function EvolusWidget() {
  await connection();
  const token = process.env.EVOLUS_WIDGET_TOKEN?.trim();
  if (!token || !/^wgt_[A-Za-z0-9_-]+$/.test(token)) return null;
  return (
    <Script
      src="https://api.evolus.ai/widget/v1/evolus-widget.min.js"
      data-token={token}
      strategy="lazyOnload"
    />
  );
}
