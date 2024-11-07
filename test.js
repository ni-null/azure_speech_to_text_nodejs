import fs from "fs-extra"
import { BlobServiceClient } from "@azure/storage-blob"
import path from "path"
import { fileURLToPath } from "url"
import ora from "ora"
import { glob } from "glob"
import PQueue from "p-queue"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const configPath = path.join(__dirname, "config.json")
const { ContainerUrl, SAS_KEY, init_blob } = fs.readJsonSync(configPath)
const init_blob_time = Date.now()
const spinner = ora()

;(async () => {
  await deleteNotExists(1730952487807)
  console.log("ok")
})()
