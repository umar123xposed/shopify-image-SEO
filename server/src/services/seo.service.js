const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const { Readable } = require('stream');

class SEOService {
  constructor(shopName, shopifyKey, geminiKey) {
    this.shopName = shopName;
    this.shopifyKey = shopifyKey;
    this.geminiKey = geminiKey;
    this.PROGRESS_FILE = "./progress.json";
    
    this.isRunning = false;
    this.totalProducts = 0;
    this.completedProducts = 0;
    this.currentProduct = null;
    this.currentImage = null;
    this.processedImages = [];  // Keep track of recently processed images
    this.maxProcessedImages = 5;  // Number of recent images to show
    this.onProgress = null;
  }

  // Load progress from file
  loadProgress() {
    if (fs.existsSync(this.PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(this.PROGRESS_FILE, "utf-8"));
    }
    return { lastProductId: null };
  }

  // Save progress to file
  saveProgress(productId) {
    fs.writeFileSync(this.PROGRESS_FILE, JSON.stringify({ lastProductId: productId }, null, 2));
  }

  // Fetch all products from Shopify
  async fetchProducts() {
    let allProducts = [];
    let nextPageUrl = `https://${this.shopName}.myshopify.com/admin/api/2024-01/products.json?limit=50`;

    try {
      while (nextPageUrl) {
        const response = await axios.get(nextPageUrl, {
          headers: { "X-Shopify-Access-Token": this.shopifyKey },
        });

        allProducts = [...allProducts, ...response.data.products];

        // Check for pagination
        const linkHeader = response.headers["link"];
        if (linkHeader) {
          const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          nextPageUrl = match ? match[1] : null;
        } else {
          nextPageUrl = null;
        }
      }

      console.log(`✅ Fetched ${allProducts.length} products from Shopify.`);
      return allProducts;
    } catch (error) {
      console.error("❌ Error fetching products:", error.message);
      return [];
    }
  }

  // Download image as buffer instead of base64
  async downloadImage(imageUrl) {
    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      return response.data;
    } catch (error) {
      console.error("❌ Error downloading image:", error.message);
      return null;
    }
  }

  // Convert buffer to stream
  bufferToStream(buffer) {
    return Readable.from(buffer);
  }

  // Get image description from Gemini AI
  async getImageDescription(base64Image, productTitle, productDescription) {
    try {
      const prompt = `
You are an expert in e-commerce SEO and product listing optimization.
Your task is to analyze the given image with respect to its already uploaded product title and its description which is uploaded on shopify and generate:
  1️⃣ AltText: A highly descriptive, SEO-friendly alt text (125 characters max).
  2️⃣ Filename: A short, keyword-rich filename (no spaces, no special characters, no file extension).

### **Guidelines for Alt Text**:
✅ Clearly describe the main subject of the image with respect to its product title and product description 
✅ Include relevant attributes such as **color, material, size, usage, and unique features**.  
✅ Use a natural, human-readable sentence structure.  
✅ Keep it **concise** and **highly relevant** to e-commerce SEO.  
✅ **DO NOT** start with "Image of" or "Picture of".  
✅ **DO NOT** use generic terms like "Product", "Item", or "Photo".  
✅ **DO NOT** add excessive words; focus on what truly matters.

### **Guidelines for Filename**:
✅ Create a **short and keyword-optimized filename**.  
✅ Use **hyphens (-) instead of spaces**.  
✅ Focus on **high-ranking search terms** related to the product.  
✅ **DO NOT** use unnecessary words like "photo", "image", or "screenshot".  
✅ **DO NOT** include the file extension (.jpg, .png, etc.).  
✅ **DO NOT** use special characters, only letters, numbers, and hyphens.

### **Example Outputs**:
📌 **Example 1 (Red Sneakers)**  
- Alt Text: "Stylish red canvas sneakers with white laces, rubber sole, and breathable fabric."  
- Filename: "red-canvas-sneakers-white-laces"

📌 **Example 2 (Handbag)**  
- Alt Text: "Elegant black leather handbag with gold chain strap, quilted design, and compact size."  
- Filename: "black-leather-handbag-gold-strap"

📌 **Example 3 (Plush Toy)**  
- Alt Text: "Adorable red panda plush toy with soft fur, lifelike facial details, and fluffy tail."  
- Filename: "red-panda-plush-soft-toy"

🔍 **Now analyze the following image carefully and generate the best possible SEO-optimized alt text and filename.**  
** your reponse should only be in this format(nothing more nothing less):
AltText: <description>
Filename: <name> (WITHOUT .jpg extension)**
`;

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiKey}`,
        {
          contents: [
            {
              parts: [
                { text: prompt },
                { text: productTitle },
                { text: productDescription },
                { inline_data: { mime_type: "image/jpeg", data: base64Image } },
              ],
            },
          ],
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const textResponse = response.data.candidates[0].content.parts[0].text;
      console.log(`🧠 Raw AI Response:\n${textResponse}`);

      const match = textResponse.match(/AltText:\s*(.*?)\s*\nFilename:\s*(.*)/i);
      if (!match) {
        console.warn(`⚠️ Unexpected AI response format: ${textResponse}`);
        return ["Default Alt Text", "default-filename"];
      }

      let altText = match[1].trim();
      let fileName = match[2].trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();

      return [altText, fileName];
    } catch (error) {
      console.error("❌ Error fetching AI-generated alt text and filename:", error.message);
      return ["Default Alt Text", "default-filename"];
    }
  }

  async start(progressCallback, startFresh = false) {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.onProgress = progressCallback;
    this.processedImages = [];
    
    try {
      if (startFresh && fs.existsSync(this.PROGRESS_FILE)) {
        fs.unlinkSync(this.PROGRESS_FILE);
        console.log('🔄 Starting fresh: Deleted progress file');
      }

      const products = await this.fetchProducts();
      this.totalProducts = products.length;
      this.completedProducts = 0;
      let resumeIndex = 0;

      if (!startFresh) {
        const progress = this.loadProgress();
        if (progress.lastProductId) {
          const lastIndex = products.findIndex((p) => p.id === progress.lastProductId);
          resumeIndex = lastIndex !== -1 ? lastIndex + 1 : 0;
          this.completedProducts = resumeIndex;
        }
        console.log(`⏳ Resuming from product index ${resumeIndex}...`);
      } else {
        console.log('🔄 Starting fresh from index 0');
      }

      this.updateProgress();

      for (let i = resumeIndex; i < products.length && this.isRunning; i++) {
        const product = products[i];
        
        if (!product.images || product.images.length === 0) continue;
        
        this.currentProduct = product.title;
        this.updateProgress();

        for (const image of product.images) {
          if (!this.isRunning) break;
          
          const { src, id, variant_ids } = image;
          this.currentImage = {
            id,
            src,
            productTitle: product.title,
            status: 'processing'
          };
          this.updateProgress();
          
          console.log(`🔍 Processing image ${id} for product ${product.id}...`);

          // Download image as buffer
          const imageBuffer = await this.downloadImage(src);
          if (!imageBuffer) {
            console.warn(`⚠️ Skipping image ${id} due to download error.`);
            this.currentImage.status = 'error';
            this.addToProcessedImages(this.currentImage);
            continue;
          }

          // Convert to base64 for AI processing
          const base64Image = Buffer.from(imageBuffer).toString('base64');
          const [altText, fileName] = await this.getImageDescription(base64Image, product.title, product.body_html);
          console.log(`✅ Generated -> Alt Text: "${altText}", Filename: "${fileName}"`);

          try {
            // Create FormData for image upload
            const formData = new FormData();
            const imageStream = this.bufferToStream(imageBuffer);
            
            // Add the image file with the SEO-friendly filename
            formData.append('image[attachment]', imageStream, {
              filename: `${fileName}.jpg`,
              contentType: 'image/jpeg'
            });
            
            // Add alt text
            formData.append('image[alt]', altText);

            // Upload new image
            const uploadResponse = await axios.post(
              `https://${this.shopName}.myshopify.com/admin/api/2024-01/products/${product.id}/images.json`,
              formData,
              {
                headers: {
                  ...formData.getHeaders(),
                  "X-Shopify-Access-Token": this.shopifyKey,
                },
              }
            );

            const newImageId = uploadResponse.data.image.id;
            console.log(`✅ Successfully uploaded new image (ID: ${newImageId}) with filename: ${fileName}.jpg`);

            // Handle variant reassignment
            if (variant_ids && variant_ids.length > 0) {
              for (const variantId of variant_ids) {
                await axios.put(
                  `https://${this.shopName}.myshopify.com/admin/api/2024-01/variants/${variantId}.json`,
                  { variant: { id: variantId, image_id: newImageId } },
                  { headers: { "X-Shopify-Access-Token": this.shopifyKey } }
                );
                console.log(`🔄 Reassigned variant ${variantId} to new image ${newImageId}`);
              }
            }

            // Delete old image
            await axios.delete(
              `https://${this.shopName}.myshopify.com/admin/api/2024-01/products/${product.id}/images/${id}.json`,
              { headers: { "X-Shopify-Access-Token": this.shopifyKey } }
            );

            console.log(`🗑️ Deleted old image ${id} for product ${product.id}`);
            
            this.currentImage.status = 'completed';
            this.currentImage.newAltText = altText;
            this.addToProcessedImages(this.currentImage);
          } catch (error) {
            console.error(`Error processing image ${id}:`, error);
            this.currentImage.status = 'error';
            this.addToProcessedImages(this.currentImage);
          }
        }

        this.completedProducts++;
        this.saveProgress(product.id);
        console.log(`💾 Progress saved! Last processed product ID: ${product.id}`);
        console.log(`💾 Completed SEO of ${this.completedProducts}/${this.totalProducts}`);
        this.updateProgress();
      }
    } catch (error) {
      console.error("❌ Error in SEO process:", error);
      this.isRunning = false;
      this.updateProgress();
    }
  }

  addToProcessedImages(image) {
    this.processedImages.unshift(image);  // Add to the beginning
    if (this.processedImages.length > this.maxProcessedImages) {
      this.processedImages.pop();  // Remove the oldest
    }
    this.updateProgress();
  }

  stop() {
    this.isRunning = false;
    this.updateProgress();
  }

  updateProgress() {
    if (this.onProgress) {
      this.onProgress({
        isRunning: this.isRunning,
        totalProducts: this.totalProducts,
        completedProducts: this.completedProducts,
        currentProduct: this.currentProduct,
        currentImage: this.currentImage,
        processedImages: this.processedImages
      });
    }
  }
}

module.exports = SEOService; 