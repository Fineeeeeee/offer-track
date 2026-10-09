const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');

const packageImport = 'import com.offerjing.mobile.audio.AndroidAudioConverterPackage';
const packageRegistration = '          add(AndroidAudioConverterPackage())';

module.exports = function withOfferJingAudioConverter(config) {
  return withDangerousMod(config, [
    'android',
    async (projectConfig) => {
      const { projectRoot, platformProjectRoot } = projectConfig.modRequest;
      const sourceDir = path.join(projectRoot, 'native', 'android');
      const targetDir = path.join(
        platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'offerjing',
        'mobile',
        'audio'
      );

      await fs.mkdir(targetDir, { recursive: true });
      await Promise.all(
        ['AndroidAudioConverterModule.kt', 'AndroidAudioConverterPackage.kt'].map((fileName) =>
          fs.copyFile(path.join(sourceDir, fileName), path.join(targetDir, fileName))
        )
      );

      const applicationPath = path.join(
        platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'offerjing',
        'mobile',
        'MainApplication.kt'
      );
      let application = await fs.readFile(applicationPath, 'utf8');

      if (!application.includes(packageImport)) {
        application = application.replace(
          'import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint',
          `import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint\n\n${packageImport}`
        );
      }
      if (!application.includes('add(AndroidAudioConverterPackage())')) {
        application = application.replace(
          '          // add(MyReactNativePackage())',
          `          // add(MyReactNativePackage())\n${packageRegistration}`
        );
      }

      await fs.writeFile(applicationPath, application);
      return projectConfig;
    },
  ]);
};
