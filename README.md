
# 视频处理指南

## 一、视频格式要求与转换

### 支持的视频格式
本项目支持 **mp4（H.264 编码）** 格式的视频输入。

### 格式转换方法
若你的视频格式不符合要求，可使用 `ffmpeg` 工具进行转换，命令如下：
```bash
ffmpeg -i input_video.xxx -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k output_video.mp4
```
**参数说明**：
- `input_video.xxx`：原始视频文件名（支持任意格式）
- `output_video.mp4`：输出的 MP4 文件名
- `-c:v libx264`：指定视频编码为 H.264
- `-crf 23`：画质参数（范围 18-28，数值越小画质越高）
- `-preset medium`：编码速度与压缩率的平衡设置
- `-c:a aac -b:a 128k`：音频编码为 AAC，码率 128kbps

## 二、批量视频处理

### 处理流程
项目支持对多个视频进行批量处理，处理流程如下：
1. 逐帧读取输入视频
2. 将每一帧图像数据送入 Kalidokit 进行处理
3. 保存处理后的帧图像

### 使用方法
直接在网页中选择多个视频后选择批量处理
```bash
运行 npm install     npm run dev 进行运行
```

## 三、帧图像存储与视频合成

### 帧图像存储格式
处理后的每一帧图像将以如下格式保存：
```
frame_0000.png
frame_0001.png
frame_0002.png
...
```

### 视频合成命令
使用以下 `ffmpeg` 命令将帧图像合成为视频：
```bash
ffmpeg -framerate 30 -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p output.mp4
```
**参数说明**：
- `-framerate 30`：设置输出视频帧率为 30fps（可根据实际情况调整）
- `-i frame_%04d.png`：指定输入帧图像的文件名格式
- `-c:v libx264`：使用 H.264 编码
- `-pix_fmt yuv420p`：像素格式设置，确保视频兼容性
- `output.mp4`：输出视频的文件名

## 四、依赖安装

### 安装 ffmpeg
```bash
# macOS (使用 Homebrew)
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows (从官网下载安装包)
https://ffmpeg.org/download.html
```



## 五、常见问题

### 1. 视频转换失败
- 检查 `ffmpeg` 是否正确安装并添加到系统路径
- 确保输入视频文件没有损坏

### 2. 帧合成视频时出现错误
- 确认所有帧图像文件名格式一致（如 `frame_0000.png`）
- 检查帧率参数是否与原始视频匹配

### 3. 内存不足
- 处理高分辨率视频时，可尝试降低帧率或分辨率
- 分批处理大量视频文件

