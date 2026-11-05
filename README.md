<br /><br />

<div align="center">
  <h1 align="center">
    <img alt="heyform logo" height="60" src="./assets/images/logo.svg">
  </h1>
  <p><b>Open-source form builder, built for small business success </b> </p>
</div>
<p align="center">
  <a target="_blank" href="https://heyform.net">Website</a> | <a target="_blank" href="https://docs.heyform.net">Documentation</a> | <a target="_blank" href="https://heyform.net/blog">Blog</a>
</p>

<p align="center">
<a href="https://trendshift.io/repositories/9025" target="_blank"><img src="https://trendshift.io/api/badge/repositories/9025" alt="heyform" style="width: 250px; height: 55px;" width="250" height="55"/></a>
</p>

<img src="./assets/images/screenshot.png" alt="HeyForm" />

## Features

HeyForm simplifies the creation of conversational forms, making it accessible for anyone to gather information or feedback through engaging surveys, quizzes, and polls. We are committed to enhancing HeyForm with regular updates, including bug fixes, new features, and performance improvements.

### Build Forms with Ease

- **Versatile Inputs**: From basic text, email, and phone number fields to advanced options like picture choices, date pickers, and file uploads, HeyForm supports a wide array of input types.
- **Smart Logic**: Conditional logic and URL redirections for dynamic, adaptable forms.
- **Powerful Integrations**: Connect with webhooks, analytics, marketing platforms, and tools like Zapier and Make.com.

### Customize to Your Brand

- **Visual Themes**: Tailor the look and feel of your forms to match your brand identity with customizable fonts, colors, backgrounds, and more.
- **Advanced Theming**: Gain greater control with extensive customization options, including custom CSS for deeper personalization.

### Analyze and Act on Data

- **Insightful Analytics**: Gain insights with detailed analytics, including drop-off rates and completion rates.
- **Data Export**: Easily export your form results to CSV for further analysis or integration into your systems.

## UI Redesign — Warm Editorial

This fork ships a full UI/UX redesign of the webapp, inspired by the design language of modern editorial SaaS products (see: youform.com, wisprflow.ai).

### Design language

| Token | Light | Dark |
| --- | --- | --- |
| Canvas | `#F4F3EE` warm cream | `#161513` warm charcoal |
| Cards | `#FFFFFF` + soft warm shadow | `#1E1D1A` |
| Ink (primary text) | `#1C1B17` | `#F5F4EE` cream |
| Brand (primary actions) | `#26352B` forest green pill | `#F2C14E` warm yellow pill |
| Accents | butter yellow `#F2C14E`, sage `#7FA98C`, lavender `#E6E2F4` | same pastel family |

### What changed

- **Theme core** (`globals.scss`, `tailwind.config.js`): warm cream/charcoal palettes, yellow text selection, rounded-2xl cards, pill-shaped active states with brand-colored indicator bars
- **Typography**: Playfair Display (self-hosted, italic weights registered) for editorial serif headlines on auth pages, onboarding and dashboard greeting; Inter remains the UI font
- **Auth pages**: editorial shell — cream canvas with soft green/yellow radial glows, white rounded-3xl card, serif italic headlines, outlined social buttons (fixes button hierarchy), responsive widths (fixes mobile overflow), yellow link accents in dark mode
- **Buttons**: fully rounded pill shape; ghost buttons get warm sand borders
- **Dashboard**: serif greeting + stat cards with pastel icon chips (sage/butter/lavender/peach)
- **Workspace**: rounded-2xl main container with warm layered shadow, warmer sidebar hover/active states
- **Brand assets**: logo, favicon, OG image and renderer logo recolored from blue to the forest/yellow/sage palette
- **Form themes**: default form theme and the first three theme presets now lead with the warm editorial palette (cream canvas, forest green buttons, butter yellow, sage)
- **i18n**: added `signUp.subHeadline` across all 10 locales

## Getting started with HeyForm

The simplest and most efficient way to dive into HeyForm is through [our official hosted service](https://my.heyform.net). When you choose this cloud version, you're getting the advantage of high reliability, automatic backups, robust security, and hassle-free maintenance—all carefully managed by us, the passionate duo behind HeyForm.

Choosing our hosted version not only saves a significant amount of time and resources but also supports HeyForm's development and the open-source community. Get a great service while backing innovation. 💙

## Structure

```
.
└── packages
    ├── answer-utils       (form submission utils for server and webapp)
    ├── embed              (form embed javascript library)
    ├── form-renderer      (form rendering library)
    ├── shared-types-enums (shared types/enums for server and webapp)
    ├── utils              (common utils for server and webapp)
    ├── server             (node server)
    └── webapp             (react webapp)
```

## Self-hosting

Interested in self-hosting HeyForm on your server? Take a look at the [self-hosting installation instructions](https://docs.heyform.net/open-source/self-hosting).

To connect a self-hosted identity provider such as Authelia, Authentik, or Keycloak, see the [generic OpenID Connect setup guide](https://docs.heyform.net/open-source/configuration/oidc).

### One Click Deployment

<a href="https://zeabur.com/templates/9YAUUO" style="margin-left:8px">
        <img src="https://zeabur.com/button.svg" alt="Deploy on Zeabur" />
</a>

<a href="https://cloud.sealos.io/?openapp=system-template%3FtemplateName%3Dheyform" style="margin-left:16px">
        <img src="https://cdn.jsdelivr.net/gh/labring-actions/templates@main/Deploy-on-Sealos.svg" alt="Deploy on Sealos" height="36" />
</a>

<a href="https://repocloud.io/details/?app_id=283" style="margin-left:24px">
        <img src="https://d16t0pc4846x52.cloudfront.net/deploylobe.svg" alt="Deploy to RepoCloud" height="36" />
</a>

<a href="https://computenest.console.aliyun.com/service/instance/create/cn-hangzhou?type=user&ServiceId=service-a47e56f0ea9f460d8d33" style="margin-left:24px">
        <img src="https://service-info-public.oss-cn-hangzhou.aliyuncs.com/computenest-en.svg" alt="Deploy on Alibaba Cloud" height="36" />
</a>

<a href="https://zop.dev/zopday/app/deploy?image=heyform/community-edition&port=9157" style="margin-left:24px">
        <img src="https://zop.dev/deploytozopday-inkhard.svg" alt="Deploy on ZopDay" height="36" />
</a>

## Local development

Follow the [local installation instructions](https://docs.heyform.net/open-source/local-development) to run the project locally.

## How to Contribute
You are awesome, let's build great software together. Head over to the [contribute docs](https://docs.heyform.net/open-source/contribute) to get started. 💪

## Support & Community

You'll find a lot of resources to help you get started with HeyForm in the [help center](https://docs.heyform.net). However, if you can't find what you're looking for there, don't hesitate to reach out to us:

- Have a question? Join the [Discord server](https://discord.gg/sgT4v4GSTe) and get instant help.
- Found a bug? [Create an issue](https://github.com/heyform/heyform/issues/new/choose)

## License

HeyForm is open-source under the GNU Affero General Public License v3.0 (AGPL-3.0), you will find more information about the license and how to comply with it [here](https://docs.heyform.net/open-source/license).
