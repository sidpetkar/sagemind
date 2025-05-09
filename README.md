# SageMind

A chat application powered by multimodal AI models from Google and Perplexity.

## Features

- Support for multiple AI models:
  - Gemini 2.0 Flash
  - Perplexity Sonar
  - Perplexity Sonar Pro
- Text, image, and audio input
- Google Search integration with Gemini
- Source citation display with Perplexity
- Responsive and modern UI

## Setup

1. Clone this repository
2. Install dependencies with `npm install`
3. Create a `.env.local` file with your API keys:
   ```
   # Gemini API Key - Get one from https://ai.google.dev/
   GEMINI_API_KEY=your_gemini_api_key_here
   
   # Perplexity API Key - Get one from https://docs.perplexity.ai/
   PERPLEXITY_API_KEY=your_perplexity_api_key_here
   ```
4. Run the development server with `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Model Capabilities

### Gemini 2.0 Flash
- Supports text, image, and audio inputs
- Enhanced with Google Search integration
- Great for general purpose use

### Perplexity Sonar
- Research-oriented model with citations
- Best for fact-based queries
- Automatically includes sources for reference

### Perplexity Sonar Pro
- Enhanced version of Sonar with more comprehensive answers
- Higher token limits (8k vs 4k)
- Better for academic and detailed research

## Development

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

To learn more about Next.js, take a look at the following resources:
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
