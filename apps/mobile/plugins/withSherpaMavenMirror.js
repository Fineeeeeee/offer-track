const { withProjectBuildGradle } = require('expo/config-plugins');

const repositoryRedirect = `

gradle.projectsEvaluated {
  project(':react-native-sherpa-onnx').repositories
    .withType(org.gradle.api.artifacts.repositories.MavenArtifactRepository)
    .configureEach { repository ->
      if (repository.url.toString().contains('xdcobra.github.io/maven')) {
        def localSherpaMaven = rootProject.file('../.native-maven')
        repository.url = localSherpaMaven.exists()
          ? localSherpaMaven.toURI()
          : uri('https://raw.githubusercontent.com/XDcobra/maven/main')
      }
    }
}
`;

module.exports = function withSherpaMavenMirror(config) {
  return withProjectBuildGradle(config, (projectConfig) => {
    if (!projectConfig.modResults.contents.includes("rootProject.file('../.native-maven')")) {
      projectConfig.modResults.contents += repositoryRedirect;
    }
    return projectConfig;
  });
};
