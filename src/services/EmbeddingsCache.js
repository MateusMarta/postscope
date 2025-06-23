import { openDB } from 'idb';

export class EmbeddingsCache {
    constructor(dbName = 'EmbeddingsDB', version = 1) {
      this.dbName = dbName;
      this.version = version;
      this.db = null;
    }
  
    async init() {
      if(this.db) return;
      this.db = await openDB(this.dbName, this.version, {
          upgrade(db) {
              if (!db.objectStoreNames.contains('embeddings')) {
                  db.createObjectStore('embeddings', { keyPath: 'text' });
              }
          }
      });
    }
  
    async getEmbeddings(text) {
      const result = await this.db.get('embeddings', text);
      return result ? result.embeddings : null;
    }
  
    async storeEmbeddings(text, embeddings) {
      const data = {
        text: text,
        embeddings: embeddings,
        timestamp: Date.now()
      };
      return this.db.put('embeddings', data);
    }
  
    async getOrCreateEmbeddings(text, generateEmbeddingsFn) {
      try {
        const cached = await this.getEmbeddings(text);
        if (cached) {
          console.log('Using cached embeddings for:', text.substring(0, 50) + '...');
          return cached;
        }
        
        console.log('Generating new embeddings for:', text.substring(0, 50) + '...');
        const embeddings = await generateEmbeddingsFn(text);
        
        await this.storeEmbeddings(text, embeddings);
        
        return embeddings;
      } catch (error) {
        console.error('Error in getOrCreateEmbeddings:', error);
        throw error;
      }
    }
  
    async clearCache() {
      return this.db.clear('embeddings');
    }
  
    async getCacheStats() {
        const count = await this.db.count('embeddings');
        return {
            totalEntries: count,
            dbName: this.dbName
        };
    }
  }