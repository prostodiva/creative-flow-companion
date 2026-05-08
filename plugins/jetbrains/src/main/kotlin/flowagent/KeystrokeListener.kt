package com.flowagent

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.fileEditor.FileDocumentManager

class KeystrokeListener : DocumentListener {
    override fun documentChanged(event: DocumentEvent) {
        val service = ApplicationManager.getApplication()
            .getService(FlowAgentService::class.java) ?: return

        val doc  = event.document
        val file = FileDocumentManager.getInstance().getFile(doc)?.path ?: return

        service.sendKeystroke(file)
    }
}