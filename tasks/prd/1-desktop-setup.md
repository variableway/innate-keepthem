# Desktop Application 

## Task 1: Please Add start desktop application script

- please add desktop application script in one shell or batch file to support both Mac/Linux/Windows
- Please verify it before commit it

## Task 2 : Support Multiple Language

1. This tools should support Multiple Language
2. A Language file should be provided to support multiple language
3. The language file should be in JSON format


## Task 3: Document Update

1. Update All the documents in docs folder 
2. Please add all features based on current code implementation 
3. Please update docs in docs folder

## Task 4: Please update all the docs

- README
- Agents.md
- all files in Docs
- USAGE.md
请分析所有的docs文件，更新所有的文档

## Task 5: Fix bug

1. Fix Bug:

```
## Error Type
Console TypeError

## Error Message
Load failed

Next.js version: 16.2.2 (Turbopack)

```
```
state not managed for field `db` on command `get_downloads`. You must call `.manage()` before using this command
```
2. 多语言版本似乎还是不能切换，需要默认时中文，可以切换成英文

## Task 5: yt-dlp not found

```
Failed to get video info: yt-dlp not found. Please install yt-dlp and ensure it's in PATH
```
- Please fix yt-dlp not found issu

## Task 6: Please Fix this bug

```
Failed to get video info: yt-dlp not found. Install hints for macOS: • Homebrew: brew install yt-dlp • pip: pip3 install yt-dlp • Manual: download from https://github.com/yt-dlp/yt-dlp/releases After installing, ensure yt-dlp is in your PATH, or set the path in Settings.
```

## Task 7: Include yt-dlp into this application

1. inlcude yt-dlp include this application, build it together

## Task 8: Please fix bug

```
## Error Type
Runtime TypeError

## Error Message
undefined is not an object (evaluating 'path.split')


    at getNestedValue (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/_0.sz61a._.js:12491:22)
    at I18nProvider.useCallback[t] (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/_0.sz61a._.js:12528:41)
    at StatusBadge (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/_0g4znt_._.js:1189:20)
    at react_stack_bottom_frame (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/0whz_next_dist_compiled_react-dom_06fppy-._.js:15037:33)
    at renderWithHooks (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/0whz_next_dist_compiled_react-dom_06fppy-._.js:4620:42)
    at updateFunctionComponent (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/0whz_next_dist_compiled_react-dom_06fppy-._.js:6081:36)
    at runWithFiberInDEV (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/0whz_next_dist_compiled_react-dom_06fppy-._.js:965:139)
    at performUnitOfWork (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/0whz_next_dist_compiled_react-dom_06fppy-._.js:9555:114)
    at workLoopSync (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/0whz_next_dist_compiled_react-dom_06fppy-._.js:9449:57)
    at renderRootSync (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/0whz_next_dist_compiled_react-dom_06fppy-._.js:9433:25)
    at performWorkOnRoot (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/0whz_next_dist_compiled_react-dom_06fppy-._.js:9098:61)
    at performSyncWorkOnRoot (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/0whz_next_dist_compiled_react-dom_06fppy-._.js:10263:26)
    at flushSyncWorkAcrossRoots_impl (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/0whz_next_dist_compiled_react-dom_06fppy-._.js:10179:337)
    at processRootScheduleInMicrotask (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/0whz_next_dist_compiled_react-dom_06fppy-._.js:10200:135)
    at <unknown> (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/0whz_next_dist_compiled_react-dom_06fppy-._.js:10274:188)
    at DownloadItem (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/_0g4znt_._.js:1263:362)
    at map ([native code]:null:null)
    at DownloadList (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/_0g4znt_._.js:1610:52)
    at HomePage (file:///Users/patrick/innate/innate-keepthem/vYtDL-desktop/apps/desktop/out/dev/static/chunks/_0g4znt_._.js:1952:342)

Next.js version: 16.2.2 (Turbopack)

```

## Task 9: Simple Include the bin file

1. different runable files for different platform is download in [bin](../../vYtDL/bin)
2. please include these for different platform


## Task 10: One Script to build and create desktop version

1. create one script to build/run desktop version to support Mac/Linux/Windows Platform

## Task 11: Can't see the log or process

1. Can't show the log or process of downloading
2. Please add these process and logs for knowing what's going on in the background

## Task 12: Use Task to build golang cli application and desktop Application

1. use Task to build golang cli and desktop application
2. give the hint on how to build and run golang cli application

## Task 13: verify the download feature

1. use: https://www.youtube.com/watch?v=oOCN30ulVyo to download to very golang cli application
2. use the same link to verify the desktop application feature

## Task 14: Add Queue feature

1. please check how it works if support multiple url download
2. if not support, please add a queue function 
3. the download task could be saved into a file or database to persist the download task and persist the status
4. then download the video one by one

## Task 15: Add Docker Version for Web

1. Add Docker-composer version for web application
2. need to support private NAS storage or light os like Raspberry Pi
3. please include the docker-compose.yml file in the root directory

## Task 16: Please Check the implementation

1. please update all the docs
2. please check how the store download status, how to manage these status
3. every download shoule be recorded, and show in the download list with status, and user can resume the failed one
4. multiple tasks should be support, support 2-3 download tasks at the same time, this task num could be configurated, default is 3


## Task 17: 媒体库打不开文件夹

- 媒体库点击文件夹，打不开文件夹
- 媒体库的图表看起来太硬，不够平滑，或者图表太大一点，需要美化一下

## Task 18: 使用FFmpeg进行提取视频中的音频

1. 添加新的功能就是提取下载视频中的音频
2. 主要功能为： 选择视频，点击提取音频，然后音频文件保存到设置好的地址，默认地址和视频为同一个目录

## Task 19: 给整个项目常见一个Skill已经如何通过AI实现这个项目的教程

1. 给整个项目常见一个Skill已经如何通过AI实现这个项目的教程
2. 内容包括了使用的技术，实现的步骤，以及安装必要依赖，如何使用SKILL功能
3. 提供一键式安装所有依赖的脚本
4. 整个内容放到docs目录下，目录为how-to
5. 同时进行bilili站点测试，测试地址是：https://www.bilibili.com/video/BV1kqdxBEEoe

## Task 20: 请总结yt-dlp 和FFMPEG 可以做哪些事情

1. 请整理一份yt-dlp 和FFMPEG 可以做哪些事情的总结
2. 包括了下载视频，提取音频，合并视频，合并音频，转换视频格式，转换音频格式，添加水印，添加字幕，添加背景音乐等
3. 主要重点是常用的功能，重点可以放在10-15左右，然后文档放入how-to目录下