import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.xiaodeng.xuexi"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.xiaodeng.xuexi"
        minSdk = 30
        targetSdk = 36
        versionCode = 27
        versionName = "1.6.4"
        // TEST=1 ./build-apk.sh：另起一个包名「学习（测试）」，和手机上已经装的版本并排装，不覆盖
        val test = project.findProperty("test") == "1"
        if (test) applicationIdSuffix = ".test"
        manifestPlaceholders["appLabel"] = if (test) "学习（测试）" else "学习"
    }

    // 分享版用正式签名打包（不可调试：别人插电脑也连不上页面）；证书在 android/share.jks，密码打包时从 secrets-share.properties 传进来
    signingConfigs {
        create("share") {
            storeFile = file("../share.jks")
            storePassword = project.findProperty("storePass") as String? ?: ""
            keyAlias = "xuexi"
            keyPassword = project.findProperty("storePass") as String? ?: ""
        }
    }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("share")
            isMinifyEnabled = false
        }
    }
    lint { checkReleaseBuilds = false }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
