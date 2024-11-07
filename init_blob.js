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
let totalFilesCount = null

;(async function () {
  const containerClient = new BlobServiceClient(`${ContainerUrl}?${SAS_KEY}`).getContainerClient("")

  await getTotalFiles(containerClient)

  await syncWavToJson(containerClient)

  await deleteNotExists()

  spinner.succeed(`All Job Completed!`)
})()

/*   
檢查檔案是否存在，已經存在回傳 false
否則 創建json檔案 回傳 true 
Check if a file exists. If it does, return false.
Otherwise, create the json file and return true.
*/
async function createJsonFileIfNotExists(jsonFilePath, blobUrl) {
  try {
    const exist = await fs.pathExists(jsonFilePath)

    if (exist) {
      if (init_blob.deleteNotExists) {
        const jsonData = await fs.readJson(jsonFilePath)
        await fs.writeJson(jsonFilePath, { ...jsonData, init_blob_time }, { spaces: 2 })
      }
      return false
    }

    await fs.outputJson(jsonFilePath, { data: "", status: "", bolo_link: blobUrl, init_blob_time }, { spaces: 2 })
    return true
  } catch (err) {
    console.error("Error writing JSON file:", err)
    return false
  }
}

/* 
從 blob 取回檔案，傳遞給 createJsonFileIfNotExists ()
Retrieve the file from the blob and pass it to createJsonFileIfNotExists()
*/
async function syncWavToJson(containerClient) {
  const queue = new PQueue({ concurrency: init_blob.syncWavToJsonConcurrency })
  spinner.start(`Create JSON ...`)

  const startTime = performance.now()

  let processedFilesCount = 0
  let addFilesCount = 0

  for await (const blob of containerClient.listBlobsFlat()) {
    queue.add(async () => {
      try {
        const fileExtension = path.extname(blob.name).toLowerCase()

        if (init_blob.ext.includes(fileExtension)) {
          const relativePath = path.dirname(blob.name)
          const jsonFileName = `${path.basename(blob.name, fileExtension)}.json`

          const str = path.join(containerClient.containerName, relativePath, jsonFileName)

          // 將容器放入 "blob" 資料夾
          const localJsonDir = path.join("blob", containerClient.containerName, relativePath)
          const jsonFilePath = path.join(localJsonDir, jsonFileName)
          const blobUrl = `${ContainerUrl}/${blob.name}`

          const result = await createJsonFileIfNotExists(jsonFilePath, blobUrl)

          result ? addFilesCount++ : ""

          processedFilesCount++
          if (totalFilesCount !== null) {
            spinner.text = `Create JSON Processing... ${processedFilesCount}/${totalFilesCount} files processed`
          } else {
            spinner.text = `Create JSON Processing... ${processedFilesCount} files processed`
          }
        }
      } catch (err) {
        console.error(`Error processing blob ${blob.name}:`, err)
      }
    })
  }

  await queue.onIdle()

  const endTime = performance.now()

  const executionTime = ((endTime - startTime) / 1000).toFixed(2)

  spinner.succeed(`Create JSON Finish! Added  ${addFilesCount} files ，ExecutionTime : ${executionTime}s`)
}

/*  
獲取容器中的支持文件格式的總數
Get the total number of supported file formats in the container 
*/
async function getTotalFiles(containerClient) {
  if (!init_blob.showTotal) return
  spinner.start(`Get Total...`)
  const startTime = performance.now()
  let fileCount = 0
  for await (const blob of containerClient.listBlobsFlat()) {
    const fileExtension = path.extname(blob.name).toLowerCase()
    if (init_blob.ext.includes(fileExtension)) {
      fileCount++
    }
  }
  const endTime = performance.now()
  const executionTime = ((endTime - startTime) / 1000).toFixed(2)
  spinner.succeed(`Total Files:${fileCount}，ExecutionTime : ${executionTime}s`)
  totalFilesCount = fileCount
}

/*  
刪除無關連檔案
*/
async function deleteNotExists() {
  if (!init_blob.deleteNotExists) return
  spinner.start(`Delete Not Exists JSON ...`)
  const startTime = performance.now()

  const ContainerName = ContainerUrl.split("/").pop()

  const files = await glob(`blob/${ContainerName}/**/*.json`)

  const queue = new PQueue({ concurrency: init_blob.deleteNotExistsConcurrency })

  const filteredFiles = []

  const deleteQueue = new PQueue({ concurrency: init_blob.deleteNotExistsConcurrency })

  let deleteFilesCount = 0

  files.forEach((file) => {
    queue.add(async () => {
      try {
        const data = await fs.readFile(file, "utf8")
        const json = JSON.parse(data)

        if (!json.hasOwnProperty("init_blob_time") || json.init_blob_time !== init_blob_time) {
          filteredFiles.push(file)
          deleteFilesCount++
          deleteQueue.add(async () => {
            try {
              await fs.unlink(file)
            } catch (err) {
              console.log(err)
            }
          })
        }
      } catch (err) {
        deleteFilesCount++
        deleteQueue.add(async () => {
          try {
            await fs.unlink(file)
          } catch (err) {
            console.log(err)
          }
        })
        console.error(`無法處理檔案 ${file}: ${err.message}`)
      }
    })
  })

  await queue.onIdle()
  await deleteQueue.onIdle()

  const endTime = performance.now()
  const executionTime = ((endTime - startTime) / 1000).toFixed(2)

  spinner.succeed(`Delete Not Exists JSON Finish! Added  ${deleteFilesCount} files ，ExecutionTime : ${executionTime}s`)
}
