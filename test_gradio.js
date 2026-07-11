import { client } from "https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js";

async function run() {
  const app = await client("dazzerz/Annida2Finance");
  const result = await app.predict("/predict", [
    "Pembelian LKS", // string  in 'Descriptions' Textbox component
    "Pendidikan, ATK, Hibah", // string  in 'Categories' Textbox component
  ]);
  console.log(result.data);
}
run();
