import express from "express";
import { Unit } from "./unit";

const app = express();

const unit = new Unit(false);
unit.complete(true);

app.listen(4200, () => {
  console.log("Server running on port 4200");
});
