// server.js (na RAIZ do projeto)
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chatRoutes from "./src/routes/chat.js";
import identityRouter from "./src/routes/identity.js";





const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use("/api/identity", identityRouter);

// NADA de cache para as rotas da API
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// === estáticos ===
const staticRoot = path.join(__dirname, "public");
console.log("Static root:", staticRoot);
app.use(express.static(staticRoot));                 // /css, /js, /index.html etc.
app.use("/audio", express.static(path.join(staticRoot, "audio"))); // /audio/...

// === API ===
app.use("/chat", chatRoutes);

// === página ===
app.get("/", (_req, res) => {
  res.sendFile(path.join(staticRoot, "index.html"));
});

const PORT = process.env.PORT || 3030;
app.listen(PORT, () => console.log(`Server ON http://localhost:${PORT}`));
