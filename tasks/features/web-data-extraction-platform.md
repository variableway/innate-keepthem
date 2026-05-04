# Web Data Extraction Platform

## 核心概念

> 既然可以通过浏览器自动化获取观看历史，理论上**任何网页可见的数据**都可以获取！

**Page Agent + CDP (Chrome DevTools Protocol)** 可以模拟人类在网页上的所有操作：
- 点击、滚动、填写表单
- 提取文本、表格、图表数据
- 登录、导航、下载

## 可以获取的数据类型

### 1. 视频/娱乐平台 ✅

| 平台 | 可获取数据 | 示例 |
|------|-----------|------|
| **YouTube** | 观看历史、订阅列表、播放列表、点赞视频 | `youtube.com/feed/history` |
| **Bilibili** | 观看历史、追番列表、收藏、投币记录 | `bilibili.com/account/history` |
| **Netflix** | 观看活动、"继续观看"列表、评分记录 | `netflix.com/browse/my-list` |
| **Spotify** | 听歌历史、播放列表、关注艺人 | `spotify.com/account/overview` |
| **抖音** | 观看历史、喜欢列表、收藏 | `douyin.com` (需登录) |

### 2. 订阅/账单平台 ⚠️

| 平台 | 可获取数据 | 示例页面 |
|------|-----------|----------|
| **支付宝** | 账单明细、转账记录、月度报表 | `alipay.com` |
| **微信支付** | 账单、红包记录、商户消费 | `wx.qq.com` (需扫码) |
| **银行网银** | 交易明细、账单、理财记录 | 各银行网站 |
| **信用卡** | 消费记录、账单、积分 | 各银行/卡组织 |
| **订阅服务** | Netflix、Spotify、YouTube Premium 账单 | 各平台账单页面 |

**⚠️ 安全风险：账单数据属于敏感信息！**

### 3. 电商/消费记录 ⚠️

| 平台 | 可获取数据 | 示例 |
|------|-----------|------|
| **淘宝/京东** | 订单历史、物流信息、退款记录 | `taobao.com` |
| **Amazon** | 购买历史、订单追踪、浏览记录 | `amazon.com/gp/your-account` |
| **美团/饿了么** | 外卖订单、消费统计 | `meituan.com` |
| **携程/飞猪** | 出行记录、酒店订单 | `ctrip.com` |

### 4. 社交/通讯 ⚠️

| 平台 | 可获取数据 | 限制 |
|------|-----------|------|
| **微信网页版** | 聊天记录（有限） | 需手机扫码，易掉线 |
| **QQ 邮箱** | 邮件列表 | 需登录 |
| **微博** | 浏览历史、互动记录 | 公开部分 |

### 5. 工作/生产力 ✅

| 平台 | 可获取数据 | 用途 |
|------|-----------|------|
| **Notion** | 页面列表、数据库 | 备份 |
| **GitHub** | Repositories、Contributions | 统计 |
| **Google Docs** | 文档列表 | 备份 |
| **飞书/钉钉** | 文档、日程 | 备份 |

## 技术实现

### 通用数据提取框架

```rust
// src/web_extractor.rs

pub struct WebExtractor {
    browser: Browser,
}

impl WebExtractor {
    pub async fn new() -> Result<Self, String> {
        let browser = Browser::launch(
            BrowserConfig::builder()
                .user_data_dir("./browser_data".into())
                .build()
                .map_err(|e| e.to_string())?
        ).await.map_err(|e| e.to_string())?;
        
        Ok(Self { browser })
    }
    
    /// 通用数据提取
    pub async fn extract_data(
        &self,
        config: ExtractionConfig,
    ) -> Result<ExtractedData, String> {
        let page = self.browser.new_page(&config.url).await
            .map_err(|e| e.to_string())?;
        
        // 等待页面加载
        tokio::time::sleep(Duration::from_secs(3)).await;
        
        // 检查是否需要登录
        if self.needs_login(&page, &config.login_indicator).await? {
            return Err("需要登录".to_string());
        }
        
        // 滚动加载（如果需要）
        if config.infinite_scroll {
            self.scroll_to_bottom(&page, config.scroll_times).await?;
        }
        
        // 执行提取脚本
        let data = page.evaluate(&config.extraction_script).await
            .map_err(|e| e.to_string())?;
        
        // 解析数据
        let parsed = self.parse_data(&data, &config.data_schema)?;
        
        Ok(parsed)
    }
    
    /// 提取账单数据（示例：支付宝）
    pub async fn extract_alipay_bills(
        &self,
        start_date: DateTime<Local>,
        end_date: DateTime<Local>,
    ) -> Result<Vec<Transaction>, String> {
        let config = ExtractionConfig {
            url: "https://www.alipay.com/".to_string(),
            login_indicator: ".user-info".to_string(),
            infinite_scroll: true,
            scroll_times: 10,
            extraction_script: format!(r#"
                // 导航到账单页面
                document.querySelector('a[href*="bill"]').click();
                await new Promise(r => setTimeout(r, 2000));
                
                // 设置日期范围
                setDateRange('{}', '{}');
                await new Promise(r => setTimeout(r, 1000));
                
                // 提取账单数据
                const transactions = [];
                document.querySelectorAll('.bill-item').forEach(el => {{
                    transactions.push({{
                        date: el.querySelector('.date')?.textContent,
                        amount: el.querySelector('.amount')?.textContent,
                        merchant: el.querySelector('.merchant')?.textContent,
                        category: el.querySelector('.category')?.textContent,
                    }});
                }});
                
                return transactions;
            "#, start_date.format("%Y-%m-%d"), end_date.format("%Y-%m-%d")),
            data_schema: vec![
                Field::new("date", FieldType::Date),
                Field::new("amount", FieldType::Float),
                Field::new("merchant", FieldType::String),
                Field::new("category", FieldType::String),
            ],
        };
        
        let data = self.extract_data(config).await?;
        
        // 转换为交易记录
        let transactions: Vec<Transaction> = data.records
            .into_iter()
            .map(|r| Transaction::from(r))
            .collect();
        
        Ok(transactions)
    }
}

/// 提取配置
pub struct ExtractionConfig {
    pub url: String,
    pub login_indicator: String,  // CSS selector to check if logged in
    pub infinite_scroll: bool,
    pub scroll_times: usize,
    pub extraction_script: String,
    pub data_schema: Vec<Field>,
}
```

### 插件化数据提取器

```rust
// src/extractors/mod.rs

pub trait DataExtractor {
    fn name(&self) -> &str;
    fn supported_platforms(&self) -> Vec<&str>;
    async fn extract(&self, browser: &Browser, params: ExtractParams) -> Result<Data, Error>;
}

// YouTube 观看历史提取器
pub struct YouTubeHistoryExtractor;

impl DataExtractor for YouTubeHistoryExtractor {
    fn name(&self) -> &str { "YouTube Watch History" }
    
    fn supported_platforms(&self) -> Vec<&str> {
        vec!["youtube.com", "youtu.be"]
    }
    
    async fn extract(&self, browser: &Browser, params: ExtractParams) -> Result<Data, Error> {
        // 实现...
    }
}

// 支付宝账单提取器
pub struct AlipayBillExtractor;

impl DataExtractor for AlipayBillExtractor {
    fn name(&self) -> &str { "Alipay Bills" }
    
    fn supported_platforms(&self) -> Vec<&str> {
        vec!["alipay.com"]
    }
    
    async fn extract(&self, browser: &Browser, params: ExtractParams) -> Result<Data, Error> {
        // 实现...
    }
}

// 注册所有提取器
pub fn get_all_extractors() -> Vec<Box<dyn DataExtractor>> {
    vec![
        Box::new(YouTubeHistoryExtractor),
        Box::new(AlipayBillExtractor),
        Box::new(TaobaoOrderExtractor),
        Box::new(NetflixHistoryExtractor),
        // ... 更多
    ]
}
```

## 数据汇总仪表盘

```tsx
// 个人数据中心
export function PersonalDataDashboard() {
  return (
    <Tabs defaultValue="entertainment">
      <TabsList>
        <TabsTrigger value="entertainment">🎬 娱乐</TabsTrigger>
        <TabsTrigger value="finance">💰 财务</TabsTrigger>
        <TabsTrigger value="shopping">🛒 消费</TabsTrigger>
        <TabsTrigger value="social">💬 社交</TabsTrigger>
      </TabsList>
      
      <TabsContent value="entertainment">
        <WatchHistoryPanel />
        <MusicHistoryPanel />
        <SubPanel />
      </TabsContent>
      
      <TabsContent value="finance">
        <BillAggregatorPanel />
        <SubscriptionPanel />
        <MonthlyReportPanel />
      </TabsContent>
      
      <TabsContent value="shopping">
        <OrderHistoryPanel />
        <ExpenseAnalysisPanel />
      </TabsContent>
    </Tabs>
  );
}

// 账单汇总组件
function BillAggregatorPanel() {
  const [bills, setBills] = useState<AggregatedBills>({});
  
  const syncAllBills = async () => {
    // 同时从多个平台获取
    const results = await Promise.all([
      invoke("extract_alipay_bills"),
      invoke("extract_wechat_bills"),
      invoke("extract_credit_card_bills"),
    ]);
    
    // 汇总分析
    const aggregated = aggregateBills(results);
    setBills(aggregated);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>账单汇总</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <StatCard 
            title="本月支出" 
            value={bills.totalExpense} 
            trend={bills.expenseTrend}
          />
          <StatCard 
            title="订阅服务" 
            value={bills.subscriptionCount}
            detail={bills.subscriptionTotal}
          />
          <StatCard 
            title="最大支出" 
            value={bills.topExpense?.amount}
            detail={bills.topExpense?.category}
          />
        </div>
        
        <BillTimeline data={bills.timeline} />
        <CategoryPieChart data={bills.byCategory} />
      </CardContent>
    </Card>
  );
}
```

## 安全与隐私 ⚠️

### 数据敏感性分级

| 级别 | 数据类型 | 处理方式 |
|------|----------|----------|
| **低** | 观看历史、公开社交 | 本地存储 |
| **中** | 购物订单、物流信息 | 加密存储，可选云同步 |
| **高** | 银行账单、聊天记录 | 本地 only，禁止上传 |
| **极高** | 密码、支付信息 | **绝不提取** |

### 安全措施

```rust
// 数据加密存储
pub struct SecureStorage {
    key: EncryptionKey,
}

impl SecureStorage {
    pub fn save_bills(&self, bills: &[Transaction]) -> Result<(), Error> {
        let encrypted = self.encrypt(&serde_json::to_vec(bills)?)?;
        fs::write(self.bills_path(), encrypted)?;
        Ok(())
    }
    
    pub fn load_bills(&self) -> Result<Vec<Transaction>, Error> {
        let encrypted = fs::read(self.bills_path())?;
        let decrypted = self.decrypt(&encrypted)?;
        Ok(serde_json::from_slice(&decrypted)?)
    }
}

// 用户确认机制
pub async fn extract_sensitive_data(
    platform: &str,
    data_type: &str,
) -> Result<Data, Error> {
    // 显示警告对话框
    let confirmed = tauri::api::dialog::ask(
        None,
        "敏感数据提取",
        &format!(
            "即将提取您的 {} {}。\n\n"
            "此数据将：\n"
            "• 仅存储在本地设备\n"
            "• 加密保存\n"
            "• 不会上传到任何服务器\n\n"
            "是否继续？",
            platform, data_type
        ),
    );
    
    if !confirmed {
        return Err(Error::UserCancelled);
    }
    
    // 继续提取...
}
```

### 法律合规

⚠️ **重要提醒：**

1. **用户授权**：必须获得用户明确授权
2. **数据最小化**：只提取用户明确请求的数据
3. **本地存储**：敏感数据禁止上传云端
4. **透明度**：明确告知用户提取哪些数据
5. **合规性**：遵守 GDPR、个人信息保护法等法规

## 实际应用案例

### 案例 1：个人财务助手

```
功能：
- 从支付宝、微信、银行获取账单
- 自动分类消费类型
- 月度消费报告
- 订阅服务追踪（自动识别重复扣费）

用户价值：
- 一目了然所有支出
- 发现不必要的订阅
- 预算管理和储蓄目标
```

### 案例 2：数字生活存档

```
功能：
- 观看历史归档
- 购物订单备份
- 社交动态存档
- 云相册同步到本地

用户价值：
- 完整的个人数字历史
- 防止平台删除/封号导致数据丢失
- 回忆和检索
```

### 案例 3：智能推荐聚合

```
功能：
- 分析观看偏好
- 分析消费习惯
- 跨平台内容推荐
- 价格追踪和降价提醒

用户价值：
- 基于全网行为的个性化推荐
- 省钱（追踪价格变动）
- 发现新内容
```

## 扩展性

### 社区贡献提取器

```rust
// 插件系统
pub trait ExtractorPlugin {
    fn metadata(&self) -> PluginMetadata;
    fn extract(&self, ctx: &ExtractionContext) -> Result<Data, Error>;
}

// 用户可安装第三方提取器
// 例如：美团账单提取器、飞书文档备份器等
```

## 总结

**是的，理论上任何网页可见的数据都可以提取！**

**技术可行性：** ✅ 完全可行
**价值：** ✅ 极高的个人数据管理价值
**风险：** ⚠️ 需要严格的隐私保护

**推荐实现优先级：**
1. ✅ 观看历史（娱乐）- 低敏感度
2. ✅ 订阅管理 - 中等价值
3. ⚠️ 电商订单 - 高价值，注意隐私
4. ⚠️ 金融账单 - 高价值，最高安全要求

**这是一个极具潜力的功能方向！** 🚀
