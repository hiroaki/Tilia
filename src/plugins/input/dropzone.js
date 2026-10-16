import { importFiles } from "./transport.js";
export default Object.freeze({ id: "tilia-dropzone", setup(context) {
  context.styles.use({ id: "tilia-drop-input-ui", href: new URL("./drop.css", import.meta.url).href });
  let pending = false;
  context.ui.bindDropTarget({ id: "files", async onDrop({ files, scope, signal }) {
    if (pending || !scope.alive) return;
    pending = true;
    try { await importFiles(context, { files, scope, signal, source: "drop" }); }
    finally { pending = false; }
  } });
} });
