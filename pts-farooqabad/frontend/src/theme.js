// Institutional theme: deep navy + slate, restrained borderRadius.
// Deliberately avoids default AntD blue — this is a government training
// school portal, not a SaaS product, and should read that way at a glance.
const theme = {
  token: {
    colorPrimary: '#10305C',
    colorInfo: '#10305C',
    colorLink: '#10305C',
    borderRadius: 4,
    fontFamily:
      "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Layout: {
      headerBg: '#0B2545',
      siderBg: '#0B2545',
    },
    Menu: {
      darkItemBg: '#0B2545',
      darkItemSelectedBg: '#10305C',
    },
  },
};

export default theme;
