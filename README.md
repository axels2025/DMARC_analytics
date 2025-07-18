# 🛡️ DMARC Dashboard

**A comprehensive email security analytics platform for monitoring DMARC authentication and protecting your domain reputation.**

![DMARC Dashboard](https://img.shields.io/badge/React-18.x-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Backend-green?logo=supabase)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ What is DMARC Dashboard?

DMARC Dashboard is a modern web application that helps organizations monitor and analyze their email authentication posture. By uploading DMARC XML reports, you get powerful insights into:

### 🔍 **Key Features**

- **📧 Email Authentication Analysis** - Monitor DKIM and SPF authentication success rates
- **🌍 Source IP Tracking** - Identify and analyze email sources by provider and geographic location  
- **📊 Visual Analytics** - Interactive charts and trends showing your email security posture
- **🚨 Threat Detection** - Spot unauthorized email sources and potential spoofing attempts
- **📈 Historical Trends** - Track authentication performance over time
- **📋 Compliance Reporting** - Generate comprehensive reports for security audits

### 💡 **Why Use DMARC Dashboard?**

- **Protect Your Brand** - Prevent email spoofing and phishing attacks using your domain
- **Improve Deliverability** - Optimize email authentication to ensure legitimate emails reach inboxes
- **Gain Visibility** - Understand who's sending emails on behalf of your domain
- **Meet Compliance** - Satisfy security requirements with detailed DMARC monitoring

<img width="903" height="797" alt="Screenshot 2025-07-19 at 00 27 42" src="https://github.com/user-attachments/assets/01a8479e-2a80-4747-8f9b-c0ecb667fdab" />
<img width="908" height="888" alt="Screenshot 2025-07-19 at 00 28 11" src="https://github.com/user-attachments/assets/c82afcbc-301d-4dda-a865-e4b974a2378a" />
<img width="918" height="1111" alt="Screenshot 2025-07-19 at 00 31 47" src="https://github.com/user-attachments/assets/ba840b76-c749-4221-bb70-02cca28caa18" />
<img width="921" height="812" alt="Screenshot 2025-07-19 at 00 32 26" src="https://github.com/user-attachments/assets/9149b5f8-7c53-4f8c-8584-eda03630ab71" />



---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **npm** or **yarn** package manager
- **Git** for version control

### 🛠️ Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <your-repository-url>
   cd dmarc-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Environment Configuration**
   
   Create a `.env.local` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   
   > 💡 **Need Supabase credentials?** 
   > 1. Create a free account at [supabase.com](https://supabase.com)
   > 2. Create a new project
   > 3. Find your URL and anon key in Project Settings → API

4. **Database Setup**
   
   The database schema will be automatically created when you first run the application. The following tables will be created:
   - `dmarc_reports` - Main report metadata
   - `dmarc_records` - Individual email authentication records
   - `dmarc_auth_results` - Detailed authentication results

5. **Start the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

6. **Open your browser**
   
   Navigate to `http://localhost:8080` to see the application running!

### 📱 **First Steps After Setup**

1. **Create an account** - Sign up using the authentication form
2. **Upload your first DMARC report** - Click "Upload Report" and select an XML file
3. **Explore the dashboard** - View your email authentication analytics
4. **Monitor trends** - Upload more reports to see historical patterns

---

## 🏗️ Tech Stack

| Technology | Purpose | Version |
|------------|---------|---------|
| **React** | Frontend Framework | 18.x |
| **TypeScript** | Type Safety | 5.x |
| **Vite** | Build Tool & Dev Server | 5.x |
| **Supabase** | Backend & Database | Latest |
| **Tailwind CSS** | Styling Framework | 3.x |
| **shadcn/ui** | UI Components | Latest |
| **Recharts** | Data Visualization | Latest |
| **React Router** | Client-side Routing | 6.x |

---

## 📋 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 8080 |
| `npm run build` | Build for production |
| `npm run build:dev` | Build for development |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint code analysis |

---

## 🔒 Security & Privacy

- **Data Privacy** - All DMARC reports are stored securely in your Supabase instance
- **User Authentication** - Secure login powered by Supabase Auth
- **Data Isolation** - Multi-tenant architecture ensures data separation
- **Local Processing** - XML parsing happens client-side for security

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📚 Learn More

- **DMARC Specification** - [RFC 7489](https://tools.ietf.org/html/rfc7489)
- **Email Authentication** - [DKIM](https://tools.ietf.org/html/rfc6376) & [SPF](https://tools.ietf.org/html/rfc7208)
- **React Documentation** - [reactjs.org](https://reactjs.org/)
- **Supabase Docs** - [supabase.com/docs](https://supabase.com/docs)

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🆘 Support

Having issues? We're here to help!

- 📧 **Email**: support@dmarc-dashboard.com
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/your-repo/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)

---

<div align="center">

**Built with ❤️ for email security professionals**

[⭐ Star this repo](https://github.com/your-repo) | [🐛 Report Bug](https://github.com/your-repo/issues) | [✨ Request Feature](https://github.com/your-repo/issues)

</div>
