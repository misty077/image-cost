#!/usr/bin/env node

/**
 * 待优化
 * 1. 是否已压缩
 * 2. @assets / @src
 */
const http = require('http');
const https = require('https');
const path = require('path');
const readFiles = require('node-readfiles');
const fs = require('fs');
const readline = require('readline');
const inquirer = require('inquirer');

const reg = new RegExp(/(http:\/\/|https:\/\/|\/\/|\.\.\/|\.\/)(\w|\d|\/|\.|-|@)+\.(png|jpg|jpeg|svg|ico|bmp|webp|gif)+(:[0-9]{1,5})?[-a-zA-Z0-9@:%_\\\+\.~#?&/=,]*/, 'gi')
let totalResults = []
let localResults = []
let noExitsResults = []

function main() {
  inquirer.prompt([{
    type: 'input',
    name: 'fileName',
    message: '请输入项目地址(例如:/Users/ww.zhang/Desktop/tss-client): '
  }]).then((answers) => {
    if (answers && answers.fileName) {
      const fileDirPath = answers.fileName
      resolve(path.resolve(fileDirPath))
    }
  })
}

async function resolve(directory) {
  readFiles(directory, {
    filter: ['*.html', '*.js', '*.css', '*.less', '*.react', '*.vue', '*.scss', '*.sass', '*.jsx', '*.stylus', '*.tsx', '*.txt']
  }, async function(err, filename, content) {
    // 报错提示
    if (err) {
      console.log('啦啦啦啦啦 报错啦', filename, err)
    }
    // 忽略node_modules
    if (filename.startsWith('node_modules')) {
      return
    }

    const filePath = path.resolve(directory, filename)
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath)
    })

    // 逐行读取文件流
    var remaining = ''
    rl.on('line', (data) => {
      if (!data.includes(';base64,') && !data.includes('.mp4')) { // 丢弃base64、mp4
        remaining += data
      }
    })
    rl.on('close', () => {
      const matchUrls = remaining.match(reg) || []
      for (let i = 0; i < matchUrls.length; i++) {
        const urlStr = matchUrls[i]
        totalResults.push({urlValue: urlStr, fileValue: filename})
      }
      console.log(`checking...${filename}，共解析了${totalResults.length}张图片`)
    })

  }).then(async function (files) {
    await delay(300)

    console.log('文件数目：Read ' + files.length + ' file(s)');

    // 区分 网络图片、本地图片 及 不存在的图片
    let remoteUrls = []

    totalResults.map(async (item) => {
      if (item.urlValue.startsWith('http://') || item.urlValue.startsWith('https://') || item.urlValue.startsWith('//') ) { // remote
        remoteUrls.push(item.urlValue)
      } else if (item.urlValue.startsWith('./') || item.urlValue.startsWith('../')) { // local
        const fileDir = path.dirname(item.fileValue)
        const filePath = path.resolve(directory, fileDir, item.urlValue)

        try {
          const stat = fs.statSync(filePath)
          localResults.push({
            url: filePath,
            contentLength: stat.size
          })
        } catch(e) {
          if (e && e.code && e.code === 'ENOENT') { // 文件不存在
            noExitsResults.push({
              url: e.path,
              contentLength: 0
            })
          } 
        }
      }
    })

    let remotePromiseArray = []
    remoteUrls.map(async(remote) => {
      try {
        let pFunc = getContentLength(remote)
        remotePromiseArray.push(pFunc)
      } catch (err) {
        console.log('获取网络图片尺寸错误日志：', err)
      }
    })

    allWithProgress(remotePromiseArray, (progress) => {
      console.log(`获取网络图片大小进度：${progress}%`)
    }).then((remoteResult) => {
      console.log(`共计${totalResults.length}张图片，其中${noExitsResults.length}张图片不存在，${remoteResult.length}张网络图片，${localResults.length}张本地图片`)

      // 去重
      let filterResult = filter(remoteResult.concat(localResults))
      console.log(`去重后共计${filterResult.length}张图片`)

      // 排序
      const sortResult = sort(filterResult)
      sortResult.map((item) => {
        console.log((item.contentLength / 1024).toFixed(2) + 'KB' + ' ', item.url)
      })
    }).catch((error) => {
      console.log('error=', error)
    })
  })
}

// 延时
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 数组去重
function filter(filterArray) {
  let hash = {}
  return filterArray.reduce((item, next) => {
	  hash[next. url]? '': hash[next.url] = true && item.push(next);
		return item
	}, []);
}

// 数组排序
function sort(sortArray) {
  return sortArray.sort((a, b) => {
    if (a.contentLength < b.contentLength) {
      return 1
    }
    if (a.contentLength > b.contentLength) {
      return -1
    }
    return 0
  })
}

// promise.all
function allWithProgress(requests, callback) {
  let index = 0
  requests.forEach((item) => {
    item.then(()=>{
      index ++
      const progress = index * 100 / requests.length
      callback(progress.toFixed(2));
    })
  });
  return Promise.all(requests);
}

// 获取图片尺寸
function getContentLength(remote) {
  return new Promise((resolve, reject) => {
    if (remote.startsWith('//')) {
      remote = 'http:' + remote
    }
    const url = new URL(remote)
    const request = url.protocol === 'https:' ? https.request : http.request
    // request
    request(url, {
      method: 'head'
    }, res => {
      res.resume()
      res.on('end', () => {
        if (res.complete) {
          resolve({
            url: url.toString(),
            contentLength: Number(res.headers['content-length'])
          })
        } else {
          reject('res complete error')
        }
      })
    }).on('error', (err) => {
      console.log('reject=err=', err)
      reject(err)
    }).end()
  })
}

main();