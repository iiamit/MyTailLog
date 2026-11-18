package com.mytaillog.app

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mytaillog.core.api.AuthApi
import com.mytaillog.core.api.AuthException
import com.mytaillog.core.api.AuthFailure
import com.mytaillog.core.api.Session
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.Section
import com.mytaillog.design.Tokens
import com.mytaillog.design.Wordmark
import com.mytaillog.design.dTextFieldColors
import com.mytaillog.design.section
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Email one-time code sign-in (06 M-AUTH-01, 05 §8.2). Two steps: the email, then the code. */
class SignInModel(private val auth: AuthApi, private val onSession: suspend (Session) -> Unit) : ViewModel() {
    var email by mutableStateOf("")
    var code by mutableStateOf("")
    var codeStep by mutableStateOf(false)
        private set
    var busy by mutableStateOf(false)
        private set
    @StringRes var error by mutableStateOf<Int?>(null)
        private set
    var sentAt by mutableLongStateOf(0L)
        private set
    var sentAgain by mutableStateOf(false)
        private set

    val canSend get() = !busy && email.trim().let { it.contains('@') && it.length >= 3 }
    val canVerify get() = !busy && code.length == 6

    fun send(again: Boolean = false) = run {
        auth.sendCode(email.trim())
        codeStep = true
        sentAt = System.currentTimeMillis()
        sentAgain = again
    }

    fun verify() = run { onSession(auth.verifyCode(email.trim(), code)) }

    fun useDifferentEmail() {
        codeStep = false
        code = ""
        error = null
        sentAgain = false
    }

    private fun run(block: suspend () -> Unit) {
        if (busy) return
        busy = true
        error = null
        viewModelScope.launch {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: AuthException) {
                error = e.failure.message
            } catch (e: Exception) {
                error = R.string.auth_error_server
            } finally {
                busy = false
            }
        }
    }
}

private val AuthFailure.message: Int
    @StringRes get() = when (this) {
        AuthFailure.NoSignal -> R.string.auth_error_signal
        AuthFailure.CodeRejected -> R.string.auth_error_code
        AuthFailure.TooManyRequests -> R.string.auth_error_too_many
        AuthFailure.ServerError -> R.string.auth_error_server
    }

@Composable
fun SignInScreen(auth: AuthApi, onSession: suspend (Session) -> Unit) {
    val model = viewModel { SignInModel(auth, onSession) }
    val colors = MyTailLogTheme.colors
    val setup = colors.section(Section.Setup)
    SystemBarIcons(darkStatusIcons = false)
    BackHandler(enabled = model.codeStep) { model.useDifferentEmail() }

    BoxWithConstraints(Modifier.fillMaxSize().background(setup.board).imePadding()) {
        val boardHeight = maxHeight * 0.46f
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            Box(Modifier.fillMaxWidth().height(boardHeight)) {
                Column(Modifier.padding(start = Tokens.Space.s6, top = 120.dp, end = 48.dp)) {
                    Wordmark(setup.onBoard)
                    Text(stringResource(R.string.auth_lede), color = setup.onBoard2, style = MaterialTheme.typography.titleLarge, maxLines = 3)
                }
                SectionStack(Modifier.align(Alignment.CenterEnd))
            }
            Column(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = maxHeight - boardHeight)
                    .padding(horizontal = Tokens.Space.s2)
                    .clip(RoundedCornerShape(topStart = Tokens.Radius.s, topEnd = Tokens.Radius.s))
                    .background(colors.leaf)
                    .navigationBarsPadding()
                    .padding(top = Tokens.Space.s6, start = Tokens.Space.s4, end = Tokens.Space.s4, bottom = Tokens.Space.s4),
                verticalArrangement = Arrangement.spacedBy(Tokens.Space.s3),
            ) {
                if (model.codeStep) CodeStep(model) else EmailStep(model)
                model.error?.let { Text(stringResource(it), color = colors.alarmText, style = MaterialTheme.typography.bodyMedium) }
            }
        }
    }
}

@Composable
private fun EmailStep(model: SignInModel) {
    val colors = MyTailLogTheme.colors
    // Apple and Google need server routes and Credential Manager wiring that come later (05 §8.2).
    DButton(stringResource(R.string.auth_apple), onClick = {}, enabled = false)
    DButton(stringResource(R.string.auth_google), onClick = {}, kind = ButtonKind.Secondary, enabled = false)
    Text(stringResource(R.string.auth_providers_unavailable), color = colors.ink3, style = MaterialTheme.typography.bodyMedium)
    Row(Modifier.padding(vertical = Tokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
        HorizontalDivider(Modifier.weight(1f), color = colors.rule)
        Text(
            stringResource(R.string.auth_or_email),
            color = colors.ink3,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = Tokens.Space.s3),
        )
        HorizontalDivider(Modifier.weight(1f), color = colors.rule)
    }
    OutlinedTextField(
        value = model.email,
        onValueChange = { model.email = it },
        label = { Text(stringResource(R.string.auth_email_label)) },
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyLarge,
        colors = dTextFieldColors(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send),
        keyboardActions = KeyboardActions(onSend = { if (model.canSend) model.send() }),
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).semantics { contentType = ContentType.EmailAddress },
    )
    DButton(
        stringResource(R.string.auth_send),
        onClick = { model.send() },
        enabled = model.canSend || model.busy,
        busyText = if (model.busy) stringResource(R.string.auth_sending) else null,
        icon = LucideIcons.Mail,
    )
    Spacer(Modifier.height(Tokens.Space.s4))
    Text(
        stringResource(R.string.auth_footer),
        color = colors.ink3,
        style = MaterialTheme.typography.bodyMedium,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun CodeStep(model: SignInModel) {
    val colors = MyTailLogTheme.colors
    val context = LocalContext.current
    var canResend by remember(model.sentAt) { mutableStateOf(false) }
    LaunchedEffect(model.sentAt) {
        delay((model.sentAt + 30_000 - System.currentTimeMillis()).coerceAtLeast(0))
        canResend = true
    }
    Text(stringResource(R.string.auth_check_title), color = colors.ink, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
    Text(stringResource(R.string.auth_check_body, model.email.trim()), color = colors.ink, style = MaterialTheme.typography.bodyLarge)
    OutlinedTextField(
        value = model.code,
        onValueChange = { v -> model.code = v.filter(Char::isDigit).take(6) },
        label = { Text(stringResource(R.string.auth_code_label)) },
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyLarge,
        colors = dTextFieldColors(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { if (model.canVerify) model.verify() }),
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).semantics { contentType = ContentType.SmsOtpCode },
    )
    DButton(
        stringResource(R.string.auth_sign_in),
        onClick = { model.verify() },
        enabled = model.canVerify || model.busy,
        busyText = if (model.busy) stringResource(R.string.auth_signing_in) else null,
    )
    DButton(stringResource(R.string.auth_send_again), onClick = { model.send(again = true) }, kind = ButtonKind.Quiet, enabled = canResend && !model.busy)
    if (model.sentAgain) {
        val time = android.text.format.DateFormat.getTimeFormat(context).format(java.util.Date(model.sentAt))
        Text(stringResource(R.string.auth_sent_again, time), color = colors.ink3, style = MaterialTheme.typography.bodyMedium)
    }
    DButton(stringResource(R.string.auth_different_email), onClick = model::useDifferentEmail, kind = ButtonKind.Quiet, enabled = !model.busy)
}

/** The six section colours stacked at the board's right edge (decorative, hidden from TalkBack). */
@Composable
private fun SectionStack(modifier: Modifier = Modifier) {
    val colors = MyTailLogTheme.colors
    Column(modifier.width(24.dp).clearAndSetSemantics {}) {
        listOf(Section.Status, Section.Books, Section.Maint, Section.Aircraft, Section.Docs, Section.Share).forEach {
            Box(Modifier.fillMaxWidth().height(40.dp).background(colors.section(it).board))
        }
    }
}
