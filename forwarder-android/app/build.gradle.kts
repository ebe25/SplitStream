plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.splitstream.forwarder"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.splitstream.forwarder"
        minSdk = 26
        targetSdk = 34
        versionCode = 2
        versionName = "1.1"
    }

    // Release signing from env (CI decodes the keystore from a GH secret).
    // PKCS12 minted with openssl — no JDK needed. Losing this keystore = new
    // signature = every user must uninstall/reinstall.
    val keystorePath: String? = System.getenv("FORWARDER_KEYSTORE")
    signingConfigs {
        create("release") {
            if (keystorePath != null) {
                storeFile = file(keystorePath)
                storeType = "pkcs12"
                storePassword = System.getenv("FORWARDER_KEYSTORE_PASSWORD")
                keyAlias = "splitstream"
                keyPassword = System.getenv("FORWARDER_KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystorePath != null) signingConfigs.getByName("release") else null
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
