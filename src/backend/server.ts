import express from "express";
import { Unit } from "./unit";

const app = express();

const unit = new Unit(false);
unit.complete(true);

const PORT = 4200;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
