import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // EMERGENCY API: Sync Offline Reports
  app.post("/api/sync", (req, res) => {
    const { payload, type, timestamp } = req.body;
    console.log(`[SYNC] Received ${type} packet at ${new Date(timestamp).toISOString()}`);
    
    // Simulate processing and verification logic
    res.json({ 
      status: "synced", 
      id: Math.random().toString(36).substring(7),
      serverTimestamp: Date.now() 
    });
  });

  // TACTICAL API: Get Community Hazards
  app.get("/api/hazards", (req, res) => {
    res.json([
      { id: 'ext1', lat: 13.315, lng: 77.532, category: 'flood', severity: 'high', timestamp: Date.now(), verificationCount: 88, note: "Water logging near College Main Road" },
      { id: 'ext2', lat: 13.305, lng: 77.525, category: 'accident', severity: 'critical', timestamp: Date.now(), verificationCount: 45, note: "Accident reported on Doddaballapur Bypass" }
    ]);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`OfflineNav AI Engine running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
