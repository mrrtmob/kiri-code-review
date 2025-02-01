# Intellizzer: Your Intelligent Code Companion

Welcome to **Intellizzer**, the GitHub Action that transforms your code review process into a seamless and insightful experience! Powered by cutting-edge large language models, Intellizzer goes beyond traditional reviews, offering you a smart assistant that enhances code quality while saving you precious time.

## 🚀 Features That Elevate Your Coding Experience

- **Smart Code Reviews**: Let advanced models analyze your pull requests, providing you with sophisticated insights and recommendations.
- **Constructive Feedback**: Receive tailored comments that help refine your code, making it cleaner and more efficient.
- **Flexible File Filtering**: Easily exclude specific file types from reviews, ensuring your focus remains on the essentials.
- **Effortless Integration**: Set up Intellizzer in your GitHub workflow with minimal hassle and get started right away!

## 🔧 Quick Setup

Ready to revolutionize your code reviews? Follow these simple steps to get Intellizzer up and running:

1. **Get Your API Key**:
   - For **Blizzer API**: Sign up for an API key at [Blizzer](https://api.blizzer.tech) if you don’t have one yet.
   - For **OpenAI-Compatible Endpoint**: Sign up for an API key from your preferred service that offers OpenAI-compatible endpoints.

2. **Store Your API Key**: In your GitHub repository, add your API key as a secret named `API_KEY`. Check out the [GitHub Secrets documentation](https://docs.github.com/en/actions/reference/encrypted-secrets) for guidance.

3. **Create Your Workflow File**:
   - In your repository, create a `.github/workflows/main.yml` file and include the following configuration:

   ```yaml
   name: Intellizzer Code Reviewer
   on:
     pull_request:
       types:
         - opened
         - synchronize
   permissions: write-all
   jobs:
     review:
       runs-on: ubuntu-latest
       steps:
         - name: Checkout Repository
           uses: actions/checkout@v3
         - name: Intellizzer Code Reviewer
           uses: your-username/intellizzer@main
           with:
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # Default token for authentication.
             API_KEY: ${{ secrets.API_KEY }}
             API_ENDPOINT: "https://api.blizzer.tech" # For Blizzer API endpoint
             API_MODEL: "kiri2.0" # For Blizzer model
             MODEL_TYPE: "openai" # Use "openai" for OpenAI-compatible models, if applicable
             exclude: "**/*.json, **/*.md" # Optional: specify file patterns to exclude
   ```

4. **Customize Your Username**: Replace `your-username` with your GitHub username or organization where the Intellizzer repository is hosted.
5. **Tailor Your Excludes**: Modify the `exclude` parameter to focus on the files that matter most to you.
6. **Commit Your Changes**: Save your setup, and watch as Intellizzer elevates your pull requests from ordinary to extraordinary!

## ✨ How Does It Work?

When you submit a pull request, Intellizzer springs into action! It analyzes the changes, filters out the files you want to exclude, and sends the code snippets to the specified API. With its advanced analysis, you'll receive impactful review comments that are automatically added to your pull request, guiding you toward a polished final product.

## 🤝 Contribute to Intellizzer!

We thrive on collaboration! If you have ideas, suggestions, or improvements, we’d love to hear from you. Feel free to submit issues or pull requests to help enhance the Intellizzer GitHub Action.

## 📝 License

This project is proudly licensed under the MIT License. For further details, check out the [LICENSE](LICENSE) file.
