# URL Extractor

## Task 1

1.  完成一个chrome插件，用于提取当前youtube页面中所有的视频URL
2.  假设访问页面： https://www.youtube.com/@PredictiveHistory/videos
    然后使用插件就可以获取这个页面上所有的youtube url视频连接，可以filter选项，比如前多少个，包含什么字符串的
3.  filter选中之后，点击获取，可以获取所有的URL以及对应的视频标题
4. 用户可以选择选中的视频，点击获取URL，就可以获取所有的URL视频连接下载到本地的txt文件
5. 每一个url在txt中是1行，然后编写一个python脚本，去读取这个txt文件，然后使用vYtDL下载所有的视频