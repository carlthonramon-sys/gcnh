// src/routes/identity.js
import { Router } from "express";
import { queryCpfHandler } from "../controllers/identityController.js";

const router = Router();

// GET /api/identity/cpf?cpf=06313474619
router.get("/cpf", queryCpfHandler);

export default router;
