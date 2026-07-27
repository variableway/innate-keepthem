# Design Document

## Visual Direction

- **Style**: Dark-mode financial tech, inspired by Bloomberg Terminal and modern fintech dashboards
- **Mood**: Professional, data-driven, confident — matching the "death spiral is dead" narrative tone
- **Density**: Medium-high, each page focuses on one key insight with supporting data points

## Color System

```yaml
colors:
  primary: "#4285F4"        # Google Blue — brand anchor
  secondary: "#34A853"      # Google Green — growth/positive
  accent: "#EA4335"         # Google Red — alerts/bear views
  highlight: "#FBBC05"      # Google Yellow — highlights/callouts
  background: "#0A0E1A"     # Deep navy black — main background
  surface: "#141B2D"        # Elevated surface — cards/sections
  surfaceLight: "#1E2746"   # Lighter surface — secondary cards
  text: "#E8ECF1"           # Primary text — almost white
  textMuted: "#8B95A5"      # Secondary text — muted gray
  border: "#2A3550"         # Borders and dividers
```

## Typography

```yaml
textStyles:
  heroTitle:
    fontSize: 56
    color: "$text"
    fontFamily: "MiSans"
    letterSpacing: -1
  title:
    fontSize: 40
    color: "$text"
    fontFamily: "MiSans"
    letterSpacing: -0.5
  subtitle:
    fontSize: 24
    color: "$textMuted"
    fontFamily: "MiSans"
    lineHeight: 1.4
  body:
    fontSize: 18
    color: "$text"
    fontFamily: "MiSans"
    lineHeight: 1.6
  caption:
    fontSize: 14
    color: "$textMuted"
    fontFamily: "MiSans"
    lineHeight: 1.4
  dataNumber:
    fontSize: 48
    color: "$primary"
    fontFamily: "MiSans"
    letterSpacing: -1
  label:
    fontSize: 12
    color: "$textMuted"
    fontFamily: "MiSans"
    letterSpacing: 1
```

## Layout Principles

- **Page size**: 1280 x 720 (16:9)
- **Margins**: 60px left/right, 50px top/bottom
- **Grid**: Content area = 1160 x 620
- **Cards**: Rounded rectangles (roundRect, adjustments: [8000]), surface color, subtle border
- **Data emphasis**: Large numbers with primary/accent color, supporting text muted
- **Icons**: Font Awesome solid icons in accent colors for visual anchors
- **Dividers**: Thin horizontal lines (1px, $border color) between sections

## Page-Specific Design Notes

### Cover (Page 1)
- Full-bleed dark background with subtle gradient overlay
- Large hero title centered, with Google brand colors subtly integrated
- Subtitle below with muted text
- Bottom: "Community-Powered Analysis" badge

### Chapter Pages (Pages 3, 5, 9)
- Large chapter number in primary color (01, 02, 03)
- Chapter title in heroTitle style
- Subtitle below with brief context
- Decorative accent line (4px height, primary color, short width)

### Content Pages (Pages 4, 6, 7, 8, 10, 11)
- Top: Page title with left accent bar (4px wide, primary color)
- Body: Card-based layout for data points
- Key numbers displayed prominently (dataNumber style)
- Supporting text in body style
- Source attribution in caption style at bottom

### Final Page (Page 12)
- Centered question in heroTitle style
- Subtle call-to-action below
- Clean, minimal design with generous whitespace
