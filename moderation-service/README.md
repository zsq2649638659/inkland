# Inkland 图片与 OCR 审核服务

这是给 ModelScope Studio CPU 环境使用的独立服务。它不相信浏览器传来的 NSFWJS 结果，只读取 Vercel 传来的临时图片地址，在服务端运行 NudeNet 和 PaddleOCR。

## 部署到 ModelScope（重要）

1. 把 `app.py` 和 `requirements.txt` 一起上传到创空间的代码目录，覆盖旧文件。
2. 点击「重新部署 / 重启」。首次启动会在后台自动安装 headless OpenCV（约 1-2 分钟），随后日志里会看到
   `opencv-python-headless 4.10.0.84 安装完成`，然后 `/health` 才能返回 `ok`。
3. 验证：浏览器打开 `你的空间地址/health`，看到 `"status": "ok"` 即部署成功。

> 为什么需要这一步：PaddleOCR 的依赖链会自动安装完整版 OpenCV，它在魔搭默认环境里会因为缺少
> 系统库 `libGL.so.1` 而启动失败。`app.py` 启动时检测到该问题会立刻用 headless 版 OpenCV 覆盖，
> 这是官方推荐的服务器环境做法，不影响任何识别功能。

> 如果走「自定义镜像」部署，Dockerfile 已同时安装 `libgl1` 并强制使用 headless OpenCV，同样可用。

## 环境变量

- `MODERATION_SERVICE_SECRET`：Vercel 调用本服务时使用的共享密钥。
- `NUDENET_MODEL_PATH`：可选 NudeNet ONNX 模型路径。不配置时使用 `nudenet` 自带模型。
- `NUDENET_RESOLUTION`：使用外部模型时的输入尺寸，默认 `320`。
- `PADDLEOCR_LANGUAGE`：OCR 语言，默认 `ch`，覆盖简体中文和英文。
- `PADDLEOCR_VERSION`：OCR 模型版本，默认 `PP-OCRv6`。
- `PADDLEOCR_CPU_THREADS`：CPU 推理线程数，默认 `4`。
- `PADDLEOCR_SCORE_THRESHOLD`：保留 OCR 文字的最低置信度，默认 `0.35`。

## 接口

- `GET /health`
- `POST /moderate`

请求必须携带 `x-moderation-secret`。图片地址应为短时 Supabase signed URL，不要把 Supabase service role key 放进本服务。

返回结果包含：

- `findings`：NudeNet 视觉风险。
- `ocr_results`：按图片序号保存的 OCR 全文、置信度和文字框坐标。

OCR 服务只提取可信文字，不在服务内复制后台词库。Vercel 收到结果后使用 Supabase 中当前启用的关键词和白名单判断风险；OCR 初始化、下载或识别失败时整批图片审核失败并转人工。

ModelScope 免费 CPU 资源适合测试和小规模使用，不能承诺永久在线或 SLA。
