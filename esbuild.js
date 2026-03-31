const esbuild = require("esbuild");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,                
    format: "cjs",  
    minify: true,    // Enable minification for production builds   
    sourcemap: true,  
    external: ["vscode"],      
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