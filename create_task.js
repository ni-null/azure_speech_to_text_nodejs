import { glob, globSync, globStream, globStreamSync, Glob } from "glob"
import path from "path"
import { fileURLToPath } from "url"
import ora from "ora"
import fs from "fs-extra"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const configPath = path.join(__dirname, "config.json")
const { ContainerUrl, SAS_KEY } = fs.readJsonSync(configPath)

;(async function () {
  // 創建一個 spinner 物件
  const spinner = ora()

  const EmptyFiles = await GetEmptyFiles(spinner)

  /*   console.log(EmptyFiles) */
})()

async function GetEmptyFiles(spinner) {
  spinner.start("Get JSON files where the status is null")
  const startTime = performance.now() // 開始時間戳記

  const ContainerName = ContainerUrl.split("/").pop()
  const jsfiles = await glob(`blob/${ContainerName}/**/*.json`)

  const result = jsfiles
    .map((filePath) => {
      const content = JSON.parse(fs.readFileSync(filePath, "utf8"))

      // 檢查 status 欄位是否為空，並在符合條件時返回物件
      if (content.status === "") {
        return {
          file_path: path.join(__dirname, filePath), // 合併基底 URL
          bolo_link: content.bolo_link,
        }
      }
      return null // 如果不符合條件，返回 null
    })
    .filter((item) => item !== null) // 過濾掉 null 的結果

  const endTime = performance.now()

  const executionTime = ((endTime - startTime) / 1000).toFixed(2)

  spinner.succeed(`EmptyFiles : ${result.length}，ExecutionTime : ${executionTime}s`) // 步驟1完成

  return result
}
