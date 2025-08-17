// src/routes/chat.js
import { Router } from "express";
import { chatHandler, resetHandler } from "../controllers/chatController.js";

const router = Router();
router.post("/", chatHandler);
router.post("/reset", resetHandler);

export default router;
