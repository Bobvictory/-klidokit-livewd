const {
    Application,
    live2d: { Live2DModel },
} = PIXI;

// Kalidokit provides a simple easing function
// (linear interpolation) used for animation smoothness
// you can use a more advanced easing function if you want
const {
    Face,
    Vector: { lerp },
    Utils: { clamp },
} = Kalidokit;

// Url to Live2D
const modelUrl = "../models/hiyori/hiyori_pro_t10.model3.json";

let currentModel, facemesh;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let app;

// 创建视频元素和画布
const videoElement = document.createElement('video');
videoElement.setAttribute('id', 'input_video');
videoElement.setAttribute('playsinline', '');
videoElement.setAttribute('muted', '');

// 创建文件选择按钮
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'video/*';
fileInput.style.position = 'fixed';
fileInput.style.top = '10px';
fileInput.style.left = '120px'; // 放在录制按钮旁边
fileInput.style.zIndex = '1000';
fileInput.style.display = 'none'; // 隐藏原生文件输入框
fileInput.setAttribute('multiple', '');

const fileButton = document.createElement('button');
fileButton.textContent = '选择视频';
fileButton.style.position = 'fixed';
fileButton.style.top = '10px';
fileButton.style.left = '120px';
fileButton.style.zIndex = '1000';
fileButton.onclick = () => fileInput.click();
document.body.appendChild(fileButton);
document.body.appendChild(fileInput);

// 创建用于录制的画布
const outputCanvas = document.createElement('canvas');
outputCanvas.width = 1280;  // 设置合适的输出分辨率
outputCanvas.height = 720;
const outputCtx = outputCanvas.getContext('2d');

// 创建用于显示的画布
const guideCanvas = document.createElement('canvas');
guideCanvas.className = 'guides';
document.body.appendChild(guideCanvas);

// 创建录制控制按钮
const recordButton = document.createElement('button');
recordButton.textContent = '开始录制';
recordButton.style.position = 'fixed';
recordButton.style.top = '10px';
recordButton.style.left = '10px';
recordButton.style.zIndex = '1000';
document.body.appendChild(recordButton);

// 添加进度显示元素
const progressContainer = document.createElement('div');
progressContainer.style.position = 'fixed';
progressContainer.style.top = '50px';
progressContainer.style.left = '10px';
progressContainer.style.zIndex = '1000';
progressContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
progressContainer.style.padding = '10px';
progressContainer.style.borderRadius = '5px';
progressContainer.style.color = 'white';
document.body.appendChild(progressContainer);

const durationDisplay = document.createElement('div');
durationDisplay.textContent = '录制时长: 0:00';
progressContainer.appendChild(durationDisplay);

const fileSizeDisplay = document.createElement('div');
fileSizeDisplay.textContent = '文件大小: 0 MB';
progressContainer.appendChild(fileSizeDisplay);

const progressBar = document.createElement('progress');
progressBar.max = 100;
progressBar.value = 0;
progressBar.style.width = '100%';
progressContainer.appendChild(progressBar);

// 添加视频预览元素
const previewContainer = document.createElement('div');
previewContainer.style.position = 'fixed';
previewContainer.style.top = '10px';
previewContainer.style.right = '10px';
previewContainer.style.zIndex = '1000';
previewContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
previewContainer.style.padding = '10px';
previewContainer.style.borderRadius = '5px';
document.body.appendChild(previewContainer);

const inputPreview = document.createElement('video');
inputPreview.style.width = '320px';
inputPreview.style.height = '180px';
inputPreview.setAttribute('muted', '');
inputPreview.setAttribute('loop', '');
previewContainer.appendChild(inputPreview);

const outputPreview = document.createElement('canvas');
outputPreview.style.width = '320px';
outputPreview.style.height = '180px';
outputPreview.style.marginTop = '10px';
previewContainer.appendChild(outputPreview);

// 添加质量控制元素
const qualityContainer = document.createElement('div');
qualityContainer.style.position = 'fixed';
qualityContainer.style.bottom = '10px';
qualityContainer.style.left = '10px';
qualityContainer.style.zIndex = '1000';
qualityContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
qualityContainer.style.padding = '10px';
qualityContainer.style.borderRadius = '5px';
qualityContainer.style.color = 'white';
document.body.appendChild(qualityContainer);

const qualityLabel = document.createElement('label');
qualityLabel.textContent = '视频质量: ';
qualityContainer.appendChild(qualityLabel);

const qualitySelect = document.createElement('select');
qualitySelect.innerHTML = `
    <option value="high">高质量 (5Mbps)</option>
    <option value="medium">中等质量 (2.5Mbps)</option>
    <option value="low">低质量 (1Mbps)</option>
`;
qualityContainer.appendChild(qualitySelect);

// 引入 ffmpeg.wasm
let ffmpegLoaded = false;
let ffmpeg;

const exportButton = document.createElement('button');
exportButton.textContent = '逐帧导出MP4';
exportButton.style.position = 'fixed';
exportButton.style.top = '10px';
exportButton.style.left = '220px';
exportButton.style.zIndex = '1000';
exportButton.onclick = async () => {
    if (!window.createFFmpeg) {
        alert('ffmpeg.wasm 未加载，请检查 index.html 是否已引入 ffmpeg.min.js');
        return;
    }
    if (!ffmpegLoaded) {
        exportButton.textContent = '加载ffmpeg...';
        ffmpeg = window.createFFmpeg({ log: true });
        await ffmpeg.load();
        ffmpegLoaded = true;
        exportButton.textContent = '逐帧导出MP4';
    }
    await exportVideoToMp4();
};
document.body.appendChild(exportButton);

async function exportVideoToMp4() {
    exportButton.disabled = true;
    exportButton.textContent = '处理中...';
    const fps = 30;
    const duration = videoElement.duration;
    const totalFrames = Math.floor(duration * fps);
    let frameFiles = [];
    let progressMsg = document.createElement('div');
    progressMsg.style.position = 'fixed';
    progressMsg.style.top = '60px';
    progressMsg.style.left = '220px';
    progressMsg.style.zIndex = '1000';
    progressMsg.style.backgroundColor = 'rgba(0,0,0,0.7)';
    progressMsg.style.color = 'white';
    progressMsg.style.padding = '10px';
    progressMsg.style.borderRadius = '5px';
    progressMsg.textContent = '采集帧中...';
    document.body.appendChild(progressMsg);

    for (let i = 0; i < totalFrames; i++) {
        videoElement.currentTime = i / fps;
        await new Promise(resolve => {
            videoElement.onseeked = () => resolve();
        });
        // 处理 Live2D 渲染（假设 onResults 已自动渲染到 outputCanvas）
        // 导出当前帧为图片
        const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.92);
        const imageData = atob(dataUrl.split(',')[1]);
        const array = new Uint8Array(imageData.length);
        for (let j = 0; j < imageData.length; j++) array[j] = imageData.charCodeAt(j);
        const fname = `frame${i}.jpg`;
        ffmpeg.FS('writeFile', fname, array);
        frameFiles.push(fname);
        progressMsg.textContent = `采集帧中... (${i+1}/${totalFrames})`;
    }
    progressMsg.textContent = '合成MP4中...';
    await ffmpeg.run(
        '-framerate', String(fps),
        '-i', 'frame%d.jpg',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        'output.mp4'
    );
    const data = ffmpeg.FS('readFile', 'output.mp4');
    const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'live2d_output.mp4';
    a.click();
    progressMsg.textContent = '导出完成！';
    setTimeout(()=>{document.body.removeChild(progressMsg);exportButton.disabled=false;exportButton.textContent='逐帧导出MP4';}, 3000);
}

// 集成逐帧导出图片序列为zip的功能
const exportZipButton = document.createElement('button');
exportZipButton.textContent = '逐帧导出图片序列ZIP';
exportZipButton.style.position = 'fixed';
exportZipButton.style.top = '10px';
exportZipButton.style.left = '350px';
exportZipButton.style.zIndex = '1000';
exportZipButton.onclick = async () => {
    exportZipButton.disabled = true;
    exportZipButton.textContent = '处理中...';
    const fps = 30;
    const duration = videoElement.duration;
    const totalFrames = Math.floor(duration * fps);
    const zip = new JSZip();
    let progressMsg = document.createElement('div');
    progressMsg.style.position = 'fixed';
    progressMsg.style.top = '60px';
    progressMsg.style.left = '350px';
    progressMsg.style.zIndex = '1000';
    progressMsg.style.backgroundColor = 'rgba(0,0,0,0.7)';
    progressMsg.style.color = 'white';
    progressMsg.style.padding = '10px';
    progressMsg.style.borderRadius = '5px';
    progressMsg.textContent = '采集帧中...';
    document.body.appendChild(progressMsg);

    if (!app) {
        progressMsg.textContent = '错误：PIXI 应用未初始化';
        return;
    }

    // 在zip中创建frames文件夹
    const framesFolder = zip.folder("frames");

    for (let i = 0; i < totalFrames; i++) {
        videoElement.currentTime = i / fps;
        await new Promise(resolve => {
            videoElement.onseeked = () => resolve();
        });

        // 确保模型更新
        if (currentModel && currentModel.internalModel) {
            currentModel.internalModel.motionManager.update();
        }

        // 使用 PIXI 渲染器渲染当前帧
        app.renderer.render(app.stage);

        // 将 PIXI 画布内容复制到输出画布
        outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        outputCtx.drawImage(app.view, 0, 0, outputCanvas.width, outputCanvas.height);

        // 导出当前帧
        const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.92);
        const base64 = dataUrl.split(',')[1];
        framesFolder.file(`frame${String(i).padStart(5, '0')}.jpg`, base64, {base64: true});
        progressMsg.textContent = `采集帧中... (${i+1}/${totalFrames})`;
    }
    progressMsg.textContent = '打包ZIP中...';
    zip.generateAsync({type: 'blob'}).then(blob => {
        saveAs(blob, 'frames.zip');
        progressMsg.innerHTML = `
            导出完成！请按以下步骤操作：<br>
            1. 解压 frames.zip 到 results 目录<br>
            2. 在终端中执行以下命令：<br>
            cd "/Users/liuenze/ai biancheng/代码工程/kalidokit-main/results"<br>
            mkdir -p frames<br>
            unzip frames.zip -d .<br>
            cd frames<br>
            ls -l frame*.jpg<br>
            ffmpeg -framerate 30 -pattern_type glob -i "frame*.jpg" -c:v libx264 -pix_fmt yuv420p output.mp4<br>
            <br>
            如果遇到权限问题，请使用：<br>
            sudo chmod -R 755 frames
        `;
        setTimeout(()=>{document.body.removeChild(progressMsg);exportZipButton.disabled=false;exportZipButton.textContent='逐帧导出图片序列ZIP';}, 8000);
    });
};
document.body.appendChild(exportZipButton);

// 添加批量处理按钮
const batchProcessButton = document.createElement('button');
batchProcessButton.textContent = '批量处理视频';
batchProcessButton.style.position = 'fixed';
batchProcessButton.style.top = '10px';
batchProcessButton.style.left = '220px';
batchProcessButton.style.zIndex = '1000';
document.body.appendChild(batchProcessButton);

// 添加批量处理进度显示
const batchProgressContainer = document.createElement('div');
batchProgressContainer.style.position = 'fixed';
batchProgressContainer.style.top = '90px';
batchProgressContainer.style.left = '220px';
batchProgressContainer.style.zIndex = '1000';
batchProgressContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
batchProgressContainer.style.padding = '10px';
batchProgressContainer.style.borderRadius = '5px';
batchProgressContainer.style.color = 'white';
document.body.appendChild(batchProgressContainer);

// 批量处理函数
async function processVideoFile(file) {
    return new Promise((resolve, reject) => {
        const videoUrl = URL.createObjectURL(file);
        videoElement.src = videoUrl;
        
        videoElement.onloadedmetadata = async () => {
            try {
                // 创建以视频文件名命名的文件夹
                const folderName = file.name.replace(/\.[^/.]+$/, "");
                const zip = new JSZip();
                const framesFolder = zip.folder(folderName);
                
                const fps = 30;
                const duration = videoElement.duration;
                const totalFrames = Math.floor(duration * fps);
                
                for (let i = 0; i < totalFrames; i++) {
                    videoElement.currentTime = i / fps;
                    await new Promise(resolve => {
                        videoElement.onseeked = () => resolve();
                    });

                    if (currentModel && currentModel.internalModel) {
                        currentModel.internalModel.motionManager.update();
                    }

                    app.renderer.render(app.stage);
                    outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
                    outputCtx.drawImage(app.view, 0, 0, outputCanvas.width, outputCanvas.height);

                    const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.92);
                    const base64 = dataUrl.split(',')[1];
                    framesFolder.file(`frame${String(i).padStart(5, '0')}.jpg`, base64, {base64: true});
                    
                    // 更新进度
                    batchProgressContainer.textContent = `处理 ${file.name}: ${i+1}/${totalFrames} 帧`;
                }

                const blob = await zip.generateAsync({type: 'blob'});
                saveAs(blob, `${folderName}.zip`);
                resolve();
            } catch (error) {
                reject(error);
            }
        };

        videoElement.onerror = reject;
    });
}

// 批量处理按钮点击事件
batchProcessButton.onclick = async () => {
    if (!fileInput.files.length) {
        alert('请先选择视频文件');
        return;
    }

    batchProcessButton.disabled = true;
    batchProcessButton.textContent = '处理中...';
    
    try {
        for (let i = 0; i < fileInput.files.length; i++) {
            const file = fileInput.files[i];
            batchProgressContainer.textContent = `开始处理 ${file.name} (${i+1}/${fileInput.files.length})`;
            await processVideoFile(file);
        }
        
        batchProgressContainer.innerHTML = `
            所有视频处理完成！<br>
            请按以下步骤操作：<br>
            1. 将所有zip文件解压到results目录<br>
            2. 在终端中执行：<br>
            cd "/Users/liuenze/ai biancheng/代码工程/kalidokit-main/results"<br>
            for d in */; do<br>
            &nbsp;&nbsp;cd "$d"<br>
            &nbsp;&nbsp;ffmpeg -framerate 30 -pattern_type glob -i "frame*.jpg" -c:v libx264 -pix_fmt yuv420p output.mp4<br>
            &nbsp;&nbsp;cd ..<br>
            done
        `;
    } catch (error) {
        batchProgressContainer.textContent = `处理出错: ${error.message}`;
    } finally {
        batchProcessButton.disabled = false;
        batchProcessButton.textContent = '批量处理视频';
    }
};

// 处理文件选择
fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        console.log('选择的文件信息:', {
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: new Date(file.lastModified).toLocaleString()
        });

        // 检查文件类型
        const validTypes = [
            'video/mp4',
            'video/mpeg',
            'video/x-m4v',
            'video/quicktime',
            'video/webm',
            'video/ogg'
        ];
        
        // 检查文件扩展名
        const validExtensions = ['.mp4', '.m4v', '.mov', '.webm', '.ogg'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
            console.warn('不支持的文件类型:', file.type, '扩展名:', fileExtension);
            alert(`请选择支持的视频格式：MP4, M4V, MOV, WebM, OGG\n当前文件类型: ${file.type}\n文件扩展名: ${fileExtension}`);
            return;
        }

        // 创建新的视频URL
        const videoUrl = URL.createObjectURL(file);
        console.log('创建的视频URL:', videoUrl);
        
        // 设置视频源
        videoElement.src = videoUrl;
        inputPreview.src = videoUrl;
        
        // 添加视频加载事件监听
        videoElement.onloadedmetadata = () => {
            console.log('视频元数据加载完成:', {
                duration: videoElement.duration,
                videoWidth: videoElement.videoWidth,
                videoHeight: videoElement.videoHeight,
                readyState: videoElement.readyState,
                mimeType: videoElement.mozHasAudio ? '有音频' : '无音频'
            });

            // 重置视频状态
            videoElement.currentTime = 0;
            inputPreview.currentTime = 0;
            
            // 开始播放视频
            const playPromise = videoElement.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('视频开始播放');
                }).catch(error => {
                    console.error('视频播放错误:', error);
                    // 尝试使用不同的视频格式
                    if (file.type === 'video/mp4') {
                        console.log('尝试使用不同的视频格式...');
                        // 尝试使用 video/mpeg 类型
                        videoElement.type = 'video/mpeg';
                        videoElement.play().catch(e => {
                            console.error('第二次尝试播放失败:', e);
                            alert(`视频播放失败: ${error.message}\n请确保视频使用 H.264 编码，或尝试使用其他格式的视频文件`);
                        });
                    } else {
                        alert(`视频播放失败: ${error.message}\n请检查视频格式是否正确`);
                    }
                });
            }

            const previewPromise = inputPreview.play();
            if (previewPromise !== undefined) {
                previewPromise.catch(error => {
                    console.error('预览播放错误:', error);
                });
            }
            
            // 更新视频信息显示
            const videoInfo = document.createElement('div');
            videoInfo.style.position = 'fixed';
            videoInfo.style.top = '90px';
            videoInfo.style.left = '10px';
            videoInfo.style.zIndex = '1000';
            videoInfo.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            videoInfo.style.padding = '10px';
            videoInfo.style.borderRadius = '5px';
            videoInfo.style.color = 'white';
            videoInfo.innerHTML = `
                当前视频: ${file.name}<br>
                大小: ${(file.size / (1024 * 1024)).toFixed(2)} MB<br>
                分辨率: ${videoElement.videoWidth}x${videoElement.videoHeight}<br>
                时长: ${videoElement.duration.toFixed(1)}秒<br>
                格式: ${file.type}
            `;
            document.body.appendChild(videoInfo);
            
            // 开始处理视频
            startVideo();
        };

        // 添加错误处理
        videoElement.onerror = (error) => {
            console.error('视频加载错误:', {
                error: error,
                errorCode: videoElement.error ? videoElement.error.code : 'unknown',
                errorMessage: videoElement.error ? videoElement.error.message : 'unknown',
                readyState: videoElement.readyState,
                networkState: videoElement.networkState
            });
            
            let errorMessage = '视频加载失败: ';
            if (videoElement.error) {
                switch(videoElement.error.code) {
                    case 1:
                        errorMessage += '视频加载被中断';
                        break;
                    case 2:
                        errorMessage += '网络错误';
                        break;
                    case 3:
                        errorMessage += '视频解码错误 - 请确保视频使用 H.264 编码';
                        break;
                    case 4:
                        errorMessage += '视频格式不支持 - 请尝试使用其他格式或重新编码视频';
                        break;
                    default:
                        errorMessage += videoElement.error.message;
                }
            }
            alert(errorMessage + '\n建议：\n1. 使用 H.264 编码的 MP4 文件\n2. 使用较低的分辨率\n3. 确保视频文件完整且未损坏');
        };

        // 添加加载进度监听
        videoElement.onprogress = () => {
            console.log('视频加载进度:', {
                buffered: videoElement.buffered.length > 0 ? 
                    `${(videoElement.buffered.end(0) / videoElement.duration * 100).toFixed(1)}%` : '0%',
                readyState: videoElement.readyState
            });
        };
    }
});

(async function main() {
    // 创建 PIXI 应用
    app = new PIXI.Application({
        view: document.getElementById("live2d"),
        autoStart: true,
        backgroundAlpha: 0,
        backgroundColor: 0xffffff,
        resizeTo: window,
    });

    // 加载 Live2D 模型
    currentModel = await Live2DModel.from(modelUrl, { autoInteract: false });
    currentModel.scale.set(0.4);
    currentModel.interactive = true;
    currentModel.anchor.set(0.5, 0.5);
    currentModel.position.set(window.innerWidth * 0.5, window.innerHeight * 0.8);

    // Add events to drag model
    currentModel.on("pointerdown", (e) => {
        currentModel.offsetX = e.data.global.x - currentModel.position.x;
        currentModel.offsetY = e.data.global.y - currentModel.position.y;
        currentModel.dragging = true;
    });
    currentModel.on("pointerup", (e) => {
        currentModel.dragging = false;
    });
    currentModel.on("pointermove", (e) => {
        if (currentModel.dragging) {
            currentModel.position.set(e.data.global.x - currentModel.offsetX, e.data.global.y - currentModel.offsetY);
        }
    });

    // Add mousewheel events to scale model
    document.querySelector("#live2d").addEventListener("wheel", (e) => {
        e.preventDefault();
        currentModel.scale.set(clamp(currentModel.scale.x + event.deltaY * -0.001, -0.5, 10));
    });

    // 添加模型到舞台
    app.stage.addChild(currentModel);

    // 创建 MediaPipe FaceMesh 实例
    facemesh = new FaceMesh({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        },
    });

    // 设置 FaceMesh 配置
    facemesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
    });

    // 设置 FaceMesh 回调函数
    facemesh.onResults(onResults);

    // 设置录制按钮事件
    recordButton.addEventListener('click', toggleRecording);

    // 开始处理视频
    startVideo();
})();

// 开始处理视频
const startVideo = () => {
    if (!videoElement.src) {
        console.log('请先选择视频文件');
        return;
    }
    
    const processVideo = async () => {
        if (videoElement.paused || videoElement.ended) return;
        try {
            await facemesh.send({ image: videoElement });
            requestAnimationFrame(processVideo);
        } catch (error) {
            handleError(error);
        }
    };
    processVideo();
};

// 切换录制状态
const toggleRecording = () => {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
};

// 开始录制
const startRecording = () => {
    recordedChunks = [];
    const stream = outputCanvas.captureStream(30);
    const quality = qualitySelect.value;
    const bitrate = quality === 'high' ? 5000000 : quality === 'medium' ? 2500000 : 1000000;
    
    // 检查支持的 MIME 类型
    const mimeTypes = [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm'
    ];
    
    let selectedMimeType = '';
    for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
            selectedMimeType = mimeType;
            console.log('使用视频格式:', mimeType);
            break;
        }
    }
    
    if (!selectedMimeType) {
        alert('您的浏览器不支持视频录制，请使用最新版本的 Chrome 或 Firefox');
        return;
    }
    
    mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: bitrate
    });

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
            updateFileSize();
        }
    };

    mediaRecorder.onstop = saveVideo;
    mediaRecorder.start();
    isRecording = true;
    recordButton.textContent = '停止录制';
    startDurationTimer();
};

// 停止录制
const stopRecording = () => {
    mediaRecorder.stop();
    isRecording = false;
    recordButton.textContent = '开始录制';
    stopDurationTimer();
};

// 保存视频
const saveVideo = () => {
    const blob = new Blob(recordedChunks, {
        type: mediaRecorder.mimeType
    });
    
    // 生成带时间戳的文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = mediaRecorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
    const filename = `live2d_animation_${timestamp}.${extension}`;
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    
    // 添加提示信息
    const message = document.createElement('div');
    message.style.position = 'fixed';
    message.style.top = '50%';
    message.style.left = '50%';
    message.style.transform = 'translate(-50%, -50%)';
    message.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    message.style.color = 'white';
    message.style.padding = '20px';
    message.style.borderRadius = '5px';
    message.style.zIndex = '2000';
    message.innerHTML = `
        视频已生成<br>
        时长: ${durationDisplay.textContent.replace('录制时长: ', '')}<br>
        大小: ${fileSizeDisplay.textContent.replace('文件大小: ', '')}<br>
        格式: ${mediaRecorder.mimeType}<br>
        请点击"确定"保存到本地
    `;
    document.body.appendChild(message);
    
    // 创建确定按钮
    const confirmButton = document.createElement('button');
    confirmButton.textContent = '确定';
    confirmButton.style.marginTop = '10px';
    confirmButton.style.padding = '5px 10px';
    confirmButton.style.backgroundColor = '#4CAF50';
    confirmButton.style.color = 'white';
    confirmButton.style.border = 'none';
    confirmButton.style.borderRadius = '3px';
    confirmButton.style.cursor = 'pointer';
    message.appendChild(confirmButton);
    
    // 点击确定后下载文件
    confirmButton.onclick = () => {
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(message);
    };
};

// 处理 FaceMesh 结果
const onResults = (results) => {
    if (!results.multiFaceLandmarks[0]) return;

    // 更新 Live2D 模型
    animateLive2DModel(results.multiFaceLandmarks[0]);

    // 如果正在录制，将当前帧渲染到输出画布
    if (isRecording) {
        renderFrame();
    }
};

// 渲染当前帧到输出画布
const renderFrame = () => {
    outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    const renderer = currentModel.internalModel.motionManager.renderer;
    renderer.render(currentModel.internalModel);
    outputCtx.drawImage(renderer.view, 0, 0, outputCanvas.width, outputCanvas.height);
    
    // 更新输出预览
    const previewCtx = outputPreview.getContext('2d');
    previewCtx.clearRect(0, 0, outputPreview.width, outputPreview.height);
    previewCtx.drawImage(outputCanvas, 0, 0, outputPreview.width, outputPreview.height);
};

const animateLive2DModel = (points) => {
    if (!currentModel || !points) return;

    let riggedFace;

    if (points) {
        // use kalidokit face solver
        riggedFace = Face.solve(points, {
            runtime: "mediapipe",
            video: videoElement,
            imageSize: {
                width: videoElement.videoWidth,
                height: videoElement.videoHeight
            }
        });
        rigFace(riggedFace, 0.5);
    }
};

// update live2d model internal state
const rigFace = (result, lerpAmount = 0.7) => {
    if (!currentModel || !result) return;
    const coreModel = currentModel.internalModel.coreModel;

    currentModel.internalModel.motionManager.update = (...args) => {
        // disable default blink animation
        currentModel.internalModel.eyeBlink = undefined;

        coreModel.setParameterValueById(
            "ParamEyeBallX",
            lerp(result.pupil.x, coreModel.getParameterValueById("ParamEyeBallX"), lerpAmount)
        );
        coreModel.setParameterValueById(
            "ParamEyeBallY",
            lerp(result.pupil.y, coreModel.getParameterValueById("ParamEyeBallY"), lerpAmount)
        );

        // X and Y axis rotations are swapped for Live2D parameters
        // because it is a 2D system and KalidoKit is a 3D system
        coreModel.setParameterValueById(
            "ParamAngleX",
            lerp(result.head.degrees.y, coreModel.getParameterValueById("ParamAngleX"), lerpAmount)
        );
        coreModel.setParameterValueById(
            "ParamAngleY",
            lerp(result.head.degrees.x, coreModel.getParameterValueById("ParamAngleY"), lerpAmount)
        );
        coreModel.setParameterValueById(
            "ParamAngleZ",
            lerp(result.head.degrees.z, coreModel.getParameterValueById("ParamAngleZ"), lerpAmount)
        );

        // update body params for models without head/body param sync
        const dampener = 0.3;
        coreModel.setParameterValueById(
            "ParamBodyAngleX",
            lerp(result.head.degrees.y * dampener, coreModel.getParameterValueById("ParamBodyAngleX"), lerpAmount)
        );
        coreModel.setParameterValueById(
            "ParamBodyAngleY",
            lerp(result.head.degrees.x * dampener, coreModel.getParameterValueById("ParamBodyAngleY"), lerpAmount)
        );
        coreModel.setParameterValueById(
            "ParamBodyAngleZ",
            lerp(result.head.degrees.z * dampener, coreModel.getParameterValueById("ParamBodyAngleZ"), lerpAmount)
        );

        // Simple example without winking.
        // Interpolate based on old blendshape, then stabilize blink with `Kalidokit` helper function.
        let stabilizedEyes = Kalidokit.Face.stabilizeBlink(
            {
                l: lerp(result.eye.l, coreModel.getParameterValueById("ParamEyeLOpen"), 0.7),
                r: lerp(result.eye.r, coreModel.getParameterValueById("ParamEyeROpen"), 0.7),
            },
            result.head.y
        );
        // eye blink
        coreModel.setParameterValueById("ParamEyeLOpen", stabilizedEyes.l);
        coreModel.setParameterValueById("ParamEyeROpen", stabilizedEyes.r);

        // mouth
        coreModel.setParameterValueById(
            "ParamMouthOpenY",
            lerp(result.mouth.y, coreModel.getParameterValueById("ParamMouthOpenY"), 0.3)
        );
        // Adding 0.3 to ParamMouthForm to make default more of a "smile"
        coreModel.setParameterValueById(
            "ParamMouthForm",
            0.3 + lerp(result.mouth.x, coreModel.getParameterValueById("ParamMouthForm"), 0.3)
        );
    };
};

// 更新文件大小显示
const updateFileSize = () => {
    const totalSize = recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0);
    const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
    fileSizeDisplay.textContent = `文件大小: ${sizeInMB} MB`;
};

// 开始录制时长计时器
let durationTimer;
const startDurationTimer = () => {
    let seconds = 0;
    durationTimer = setInterval(() => {
        seconds++;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        durationDisplay.textContent = `录制时长: ${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        progressBar.value = (seconds / 300) * 100; // 假设最大录制时长为5分钟
    }, 1000);
};

// 停止录制时长计时器
const stopDurationTimer = () => {
    clearInterval(durationTimer);
};

// 修改错误处理函数
const handleError = (error) => {
    console.error('Error:', error);
    let errorMessage = '发生错误: ';
    
    if (error.name === 'NotSupportedError') {
        errorMessage += '不支持的视频格式';
    } else if (error.name === 'NotReadableError') {
        errorMessage += '无法读取视频文件';
    } else if (error.name === 'AbortError') {
        errorMessage += '视频加载被中断';
    } else {
        errorMessage += error.message;
    }
    
    alert(errorMessage);
    if (isRecording) {
        stopRecording();
    }
};

// 添加重试机制
const retryVideoLoad = () => {
    let retryCount = 0;
    const maxRetries = 3;
    
    const tryLoadVideo = () => {
        videoElement.load();
        videoElement.play().catch((error) => {
            if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(tryLoadVideo, 1000);
            } else {
                handleError(error);
            }
        });
    };
    
    tryLoadVideo();
};

// 初始化时添加错误处理
videoElement.addEventListener('error', handleError);
inputPreview.addEventListener('error', handleError);
