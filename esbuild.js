const esbuild = require("esbuild");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,               // Das hier saugt 'undici' in dein out/extension.js auf!
    format: "cjs",
    minify: false,              // Zum Debuggen erstmal auf false
    sourcemap: true,
    external: ["vscode"],       // vscode darf NICHT gebündelt werden
    platform: "node",
    outfile: "out/extension.js",
  });
  await ctx.rebuild();
  await ctx.dispose();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});