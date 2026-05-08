package com.flowagent

import com.intellij.ide.AppLifecycleListener
import com.intellij.openapi.application.ApplicationManager

class AppLifecycleListener : AppLifecycleListener {
    override fun appClosing() {
        ApplicationManager.getApplication()
            .getService(FlowAgentService::class.java)
            ?.dispose()
    }
}