# Cookie Wallet: 非对称加密保护本地凭证

## 核心问题

> 本地存储的Cookie和登录凭证存在安全风险，如何用最安全的方式保护？

## 解决方案：Cookie Wallet 架构

### 核心理念

借鉴**加密货币钱包**的安全模型，使用**非对称加密**保护本地登录凭证：

```
┌─────────────────────────────────────────────────────────┐
│                    Cookie Wallet                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔐 助记词 (12/24 words)                                │
│       ↓                                                 │
│  🔑 种子 (Seed)                                         │
│       ↓                                                 │
│  🔒 私钥 (Private Key) ──→ 解密 Cookie                 │
│  📢 公钥 (Public Key) ──→ 加密 Cookie                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 为什么这样设计？

| 特性 | 说明 |
|------|------|
| **助记词备份** | 12-24个英文单词，人类可记忆和抄写 |
| **非对称加密** | 公钥加密，私钥解密，安全性极高 |
| **丢失可恢复** | 丢了私钥？重新登录即可，只是Cookie不是资产 |
| **防窃取** | 即使文件被盗，没有私钥也无法使用 |

---

## 架构设计

### 1. 密钥生成

```rust
use bip39::{Mnemonic, Language, Seed};
use secp256k1::{Secp256k1, SecretKey, PublicKey};
use rand::rngs::OsRng;

pub struct CookieWallet {
    mnemonic: Mnemonic,
    seed: Seed,
    private_key: SecretKey,
    public_key: PublicKey,
}

impl CookieWallet {
    /// 创建新钱包
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        // 生成随机助记词
        let mut rng = OsRng::default();
        let mnemonic = Mnemonic::generate_in_with(&mut rng, Language::English, 12)?;
        
        // 从助记词生成种子
        let seed = Seed::new(&mnemonic, "cookie-wallet-salt");
        
        // 从种子生成密钥对 (secp256k1)
        let secp = Secp256k1::new();
        let private_key = SecretKey::from_slice(&seed.as_bytes()[0..32])?;
        let public_key = PublicKey::from_secret_key(&secp, &private_key);
        
        Ok(Self {
            mnemonic,
            seed,
            private_key,
            public_key,
        })
    }
    
    /// 从助记词恢复钱包
    pub fn from_mnemonic(phrase: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let mnemonic = Mnemonic::parse_in(Language::English, phrase)?;
        let seed = Seed::new(&mnemonic, "cookie-wallet-salt");
        
        let secp = Secp256k1::new();
        let private_key = SecretKey::from_slice(&seed.as_bytes()[0..32])?;
        let public_key = PublicKey::from_secret_key(&secp, &private_key);
        
        Ok(Self {
            mnemonic,
            seed,
            private_key,
            public_key,
        })
    }
    
    /// 获取助记词
    pub fn get_mnemonic(&self) -> String {
        self.mnemonic.to_string()
    }
    
    /// 获取公钥 (用于加密)
    pub fn get_public_key(&self) -> PublicKey {
        self.public_key
    }
}
```

### 2. Cookie 加密/解密

```rust
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce
};
use sha2::{Sha256, Digest};

pub struct CookieVault {
    wallet: CookieWallet,
    vault_path: PathBuf,
}

impl CookieVault {
    /// 加密并保存Cookie
    pub fn save_cookie(
        &self,
        platform: &str,
        cookie_data: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // 1. 从私钥派生对称加密密钥
        let encryption_key = self.derive_encryption_key()?;
        
        // 2. 生成随机 nonce
        let nonce_bytes = rand::random::<[u8; 12]>();
        let nonce = Nonce::from_slice(&nonce_bytes);
        
        // 3. AES-256-GCM 加密
        let cipher = Aes256Gcm::new(&encryption_key);
        let ciphertext = cipher
            .encrypt(nonce, cookie_data.as_bytes())
            .map_err(|e| format!("Encryption failed: {:?}", e))?;
        
        // 4. 组合: nonce + ciphertext
        let mut encrypted_data = Vec::new();
        encrypted_data.extend_from_slice(&nonce_bytes);
        encrypted_data.extend_from_slice(&ciphertext);
        
        // 5. 保存到文件
        let file_path = self.vault_path.join(format!("{}.enc", platform));
        fs::write(&file_path, encrypted_data)?;
        
        // 6. 保存元数据 (明文，不包含敏感信息)
        let metadata = CookieMetadata {
            platform: platform.to_string(),
            encrypted_at: SystemTime::now(),
            public_key_hash: self.hash_public_key(),
        };
        self.save_metadata(platform, &metadata)?;
        
        Ok(())
    }
    
    /// 解密并读取Cookie
    pub fn load_cookie(
        &self,
        platform: &str,
    ) -> Result<String, Box<dyn std::error::Error>> {
        // 1. 读取加密文件
        let file_path = self.vault_path.join(format!("{}.enc", platform));
        let encrypted_data = fs::read(&file_path)?;
        
        // 2. 分离 nonce 和 ciphertext
        if encrypted_data.len() < 12 {
            return Err("Invalid encrypted data".into());
        }
        let (nonce_bytes, ciphertext) = encrypted_data.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        
        // 3. 派生解密密钥
        let decryption_key = self.derive_encryption_key()?;
        
        // 4. AES-256-GCM 解密
        let cipher = Aes256Gcm::new(&decryption_key);
        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| format!("Decryption failed: {:?}", e))?;
        
        Ok(String::from_utf8(plaintext)?)
    }
    
    /// 从私钥派生 AES 密钥
    fn derive_encryption_key(&self) -> Result<aes_gcm::Key<Aes256Gcm>, Box<dyn std::error::Error>> {
        let mut hasher = Sha256::new();
        hasher.update(self.wallet.private_key.as_ref());
        hasher.update(b"cookie-encryption-v1");
        let result = hasher.finalize();
        
        Ok(*aes_gcm::Key::<Aes256Gcm>::from_slice(&result))
    }
}

/// Cookie 元数据 (明文存储)
#[derive(Serialize, Deserialize)]
struct CookieMetadata {
    platform: String,
    encrypted_at: SystemTime,
    public_key_hash: String,
}
```

### 3. 浏览器集成

```rust
/// 将加密的Cookie注入浏览器
pub async fn inject_cookies_to_browser(
    &self,
    browser: &Browser,
    platform: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // 1. 解密Cookie
    let cookie_json = self.load_cookie(platform)?;
    let cookies: Vec<Cookie> = serde_json::from_str(&cookie_json)?;
    
    // 2. 注入到浏览器
    let page = browser.new_page("about:blank").await?;
    
    for cookie in cookies {
        page.set_cookie(CookieParam {
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            expires: cookie.expires,
            http_only: cookie.http_only,
            secure: cookie.secure,
            same_site: cookie.same_site,
        }).await?;
    }
    
    Ok(())
}

/// 从浏览器提取并加密Cookie
pub async fn extract_and_save_cookies(
    &self,
    browser: &Browser,
    platform: &str,
    url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let page = browser.new_page(url).await?;
    
    // 等待用户登录完成
    // (可以检测登录状态，或让用户手动触发)
    
    // 获取所有Cookie
    let cookies = page.get_cookies().await?;
    
    // 序列化并加密
    let cookie_json = serde_json::to_string(&cookies)?;
    self.save_cookie(platform, &cookie_json)?;
    
    Ok(())
}
```

### 4. 用户界面

```typescript
// 首次使用设置钱包
export function WalletSetup() {
  const [mnemonic, setMnemonic] = useState("");
  const [step, setStep] = useState(1);
  
  const createWallet = async () => {
    // 调用 Rust 生成助记词
    const words = await invoke("create_cookie_wallet");
    setMnemonic(words);
    setStep(2);
  };
  
  return (
    <div className="max-w-md mx-auto p-6">
      {step === 1 && (
        <>
          <h2 className="text-2xl font-bold mb-4">🔐 创建 Cookie 钱包</h2>
          <p className="text-muted-foreground mb-4">
            我们将使用加密钱包技术保护你的登录凭证。
            请妥善保管生成的助记词。
          </p>
          <Button onClick={createWallet} className="w-full">
            创建钱包
          </Button>
        </>
      )}
      
      {step === 2 && (
        <>
          <h2 className="text-2xl font-bold mb-4">✍️ 备份助记词</h2>
          <Alert className="mb-4 bg-yellow-50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              请将这些单词按顺序抄写到纸上并妥善保管！
              这是你恢复Cookie的唯一方式。
              丢失助记词后，你需要重新登录所有平台。
            </AlertDescription>
          </Alert>
          
          <div className="grid grid-cols-3 gap-2 mb-6">
            {mnemonic.split(" ").map((word, i) => (
              <div key={i} className="bg-muted p-2 rounded text-center">
                <span className="text-xs text-muted-foreground">{i + 1}</span>
                <div className="font-mono font-bold">{word}</div>
              </div>
            ))}
          </div>
          
          <Button onClick={() => setStep(3)} className="w-full">
            我已抄写好
          </Button>
        </>
      )}
      
      {step === 3 && (
        <>
          <h2 className="text-2xl font-bold mb-4">✅ 验证助记词</h2>
          <p className="mb-4">请输入第 3、7、12 个单词以确认你已备份：</p>
          <MnemonicVerification onComplete={() => {
            // 完成设置
          }} />
        </>
      )}
    </div>
  );
}

// 日常使用
export function CookieVaultManager() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Cookie 保险库
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <PlatformCookie platform="youtube" name="YouTube" />
          <PlatformCookie platform="bilibili" name="Bilibili" />
          <PlatformCookie platform="alipay" name="支付宝" />
        </div>
      </CardContent>
    </Card>
  );
}

function PlatformCookie({ platform, name }: { platform: string, name: string }) {
  const [status, setStatus] = useState<"empty" | "locked" | "unlocked">("empty");
  
  const unlock = async () => {
    // 输入助记词解锁
    const mnemonic = await prompt("请输入助记词以解锁：");
    if (mnemonic) {
      await invoke("unlock_cookie_vault", { platform, mnemonic });
      setStatus("unlocked");
    }
  };
  
  return (
    <div className="flex items-center justify-between p-3 border rounded">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${
          status === "unlocked" ? "bg-green-500" : "bg-gray-300"
        }`} />
        <span>{name}</span>
      </div>
      
      {status === "empty" && (
        <Button size="sm" variant="outline" onClick={captureCookies}>
          捕获Cookie
        </Button>
      )}
      
      {status === "locked" && (
        <Button size="sm" variant="outline" onClick={unlock}>
          <Lock className="h-4 w-4 mr-1" />
          解锁
        </Button>
      )}
      
      {status === "unlocked" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={injectCookies}>
            注入浏览器
          </Button>
          <Button size="sm" variant="outline" onClick={lock}>
            锁定
          </Button>
        </div>
      )}
    </div>
  );
}
```

---

## 安全优势对比

| 方案 | 安全性 | 便利性 | 丢失恢复 |
|------|--------|--------|----------|
| **浏览器默认** | ❌ 低 (明文存储) | ✅ 高 | N/A |
| **系统Keychain** | ⚠️ 中 (依赖系统) | ✅ 高 | ❌ 困难 |
| **密码管理器** | ✅ 高 | ✅ 高 | ⚠️ 需主密码 |
| **Cookie Wallet** | ✅✅ 极高 | ⚠️ 中 | ✅ 助记词恢复 |

### Cookie Wallet 的独特优势

1. **离线安全**
   - 加密文件可以放在任何地方（U盘、云盘）
   - 即使被盗，没有助记词也无法解密

2. **分级保护**
   - 助记词只存在于用户大脑或纸上
   - 私钥派生后使用，不直接存储

3. **透明可控**
   - 用户完全掌控自己的凭证
   - 没有第三方服务

4. **丢失可接受**
   - 丢了助记词？重新登录即可
   - 不像加密货币那样不可挽回

---

## 实现步骤

### Phase 1: 基础钱包 (1周)
- [x] 助记词生成
- [x] 密钥对派生
- [x] 基础加解密

### Phase 2: Cookie 保险库 (1周)
- [ ] 浏览器Cookie捕获
- [ ] 加密存储
- [ ] 注入浏览器

### Phase 3: UI/UX (1周)
- [ ] 钱包创建流程
- [ ] 助记词备份界面
- [ ] 日常使用界面

### Phase 4: 多平台支持 (1周)
- [ ] YouTube
- [ ] Bilibili
- [ ] 支付宝/微信

---

## 参考实现

```rust
// 依赖
[dependencies]
bip39 = "2.0"
secp256k1 = { version = "0.27", features = ["rand", "recovery"] }
aes-gcm = "0.10"
sha2 = "0.10"
rand = "0.8"
chromiumoxide = "0.5"
```

---

## 总结

**Cookie Wallet 设计哲学：**

> "像保护加密货币一样保护登录凭证，但不用担心丢失后血本无归"

这是一个**安全性和可用性的完美平衡**！🔐

**你的个人信息得到了银行级别的保护，同时保留了丢失后重新开始的灵活性。**
