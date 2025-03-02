import { defineConfig } from 'vite';

export default defineConfig({
  // Use the BASE_URL environment variable set in the GitHub Actions workflow
  // or default to '/' for local development
  base: process.env.BASE_URL || '/',
  build: {
    // Ensure assets are processed correctly
    assetsInlineLimit: 0, // Don't inline any assets as data URLs
    // Ensure the assets directory is correctly processed
    assetsDir: 'assets'
  },
  // Keep the original assets directory for static files
  publicDir: 'assets',
  resolve: {
    // Ensure asset imports work correctly
    alias: {
      '@assets': '/assets'
    }
  }
}); 