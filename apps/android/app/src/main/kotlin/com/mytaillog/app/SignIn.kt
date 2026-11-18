package com.mytaillog.app

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mytaillog.core.api.AuthException
import com.mytaillog.core.api.AuthFailure
import com.mytaillog.core.api.CodeKind
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

/** The leaf's steps (06 M-AUTH-01). */
enum class AuthStep { Email, Code, Password, SignUp, Reset }

/** Which button is busy; the others disable (06 M-AUTH-01 States). */
enum class AuthAction { Apple, Google, Send, Verify, Password, SignUp, Forgot, Reset }

fun isValidEmail(email: String) = email.trim().let { it.length >= 3 && it.indexOf('@') in 1 until it.length - 1 }

/** 06 M-AUTH-01: "At least 8 characters". */
fun isValidPassword(password: String) = password.length >= 8

/**
 * Every sign-in method (05 §8.2): Apple and Google, one email with a link and a code, password
 * (sign in, sign up, reset by code). Links and OAuth returns arrive through [handleReturn].
 */
class SignInModel(private val account: Account) : ViewModel() {
    private val auth = account.auth
    var step by mutableStateOf(AuthStep.Email)
        private set
    var email by mutableStateOf("")
    var code by mutableStateOf("")
    var password by mutableStateOf("")
    var name by mutableStateOf("")
    var busy by mutableStateOf<AuthAction?>(null)
        private set
    @get:StringRes var error by mutableStateOf<Int?>(null)
        private set
    /** Information, never in the alarm colour (06 M-AUTH-01 acceptance). */
    @get:StringRes var notice by mutableStateOf<Int?>(null)
        private set
    var sentAt by mutableLongStateOf(0L)
        private set
    var sentAgain by mutableStateOf(false)
        private set
    /** True when the code step was reached from a link with no email typed on this phone. */
    var askEmailWithCode by mutableStateOf(false)
        private set
    private var codeKind = CodeKind.Email
    private var lastProvider = AuthAction.Apple

    val canSend get() = busy == null && isValidEmail(email)
    val canVerify get() = busy == null && code.length == 6 && isValidEmail(email)
    val canPassword get() = canSend && password.isNotEmpty()
    val canSignUp get() = canSend && isValidPassword(password) && name.isNotBlank()
    val canReset get() = canVerify && isValidPassword(password)

    fun showSignedOutNotice() {
        if (step == AuthStep.Email) notice = R.string.auth_signed_out
    }

    fun go(to: AuthStep) {
        if (busy != null) return
        step = to
        error = null
        notice = null
        code = ""
        sentAgain = false
        askEmailWithCode = false
        if (to == AuthStep.Email || to == AuthStep.Code) password = ""
    }

    /** Back from any step returns to the email step (password reset returns to password). */
    fun back() = go(if (step == AuthStep.Reset) AuthStep.Password else AuthStep.Email)

    fun send(again: Boolean = false) = launch(AuthAction.Send) {
        val verifier = Crypto.randomToken()
        account.store.putVerifier(AuthFlow.Email, verifier)
        auth.sendCode(email.trim(), Crypto.pkce(verifier, AuthFlow.Email))
        toCodeStep(CodeKind.Email, again)
    }

    fun verify() = launch(AuthAction.Verify) { account.signIn(auth.verifyCode(email.trim(), code, codeKind)) }

    fun signInWithPassword() = launch(AuthAction.Password) { account.signIn(auth.signInWithPassword(email.trim(), password)) }

    fun signUp() = launch(AuthAction.SignUp) {
        val verifier = Crypto.randomToken()
        account.store.putVerifier(AuthFlow.Email, verifier)
        val session = auth.signUp(email.trim(), password, name.trim(), Crypto.pkce(verifier, AuthFlow.Email))
        if (session != null) account.signIn(session) else toCodeStep(CodeKind.Signup, again = false)
    }

    fun forgotPassword(again: Boolean = false) = launch(AuthAction.Forgot) {
        auth.sendPasswordReset(email.trim())
        step = AuthStep.Reset
        code = ""
        password = ""
        sentAt = System.currentTimeMillis()
        sentAgain = again
    }

    fun resetPassword() = launch(AuthAction.Reset) {
        val session = auth.verifyCode(email.trim(), code, CodeKind.Recovery)
        auth.updatePassword(session.accessToken, password)
        account.signIn(session)
    }

    fun apple(open: (String) -> Unit) = launch(AuthAction.Apple) { startOAuth("apple", open) }

    fun google(activity: Activity, open: (String) -> Unit) = launch(AuthAction.Google) {
        val nonce = Crypto.randomToken()
        val result = try {
            googleIdToken(activity, Crypto.sha256Hex(nonce))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            throw AuthException(AuthFailure.ProviderFailed, e)
        }
        when (result) {
            is GoogleResult.Token -> account.signIn(auth.signInWithIdToken("google", result.idToken, nonce))
            GoogleResult.Cancelled -> Unit // 06 M-AUTH-01: cancelled shows no message
            GoogleResult.UseBrowser -> startOAuth("google", open)
        }
    }

    /** A Custom Tab return or an email link (05 §8.4). URLs that aren't ours are ignored. */
    fun handleReturn(raw: String) {
        val ret = parseAuthReturn(raw) ?: return
        launch(if (ret.flow == AuthFlow.Email) AuthAction.Verify else lastProvider) {
            when (val outcome = completeAuthReturn(ret, account.store.takeVerifier(ret.flow), auth)) {
                is ReturnOutcome.SignedIn -> account.signIn(outcome.session)
                ReturnOutcome.EnterCode -> {
                    val noEmail = !isValidEmail(email)
                    toCodeStep(CodeKind.Email, again = false)
                    askEmailWithCode = noEmail
                    notice = R.string.auth_link_fallback
                }
                is ReturnOutcome.Failed -> throw AuthException(outcome.failure)
            }
        }
    }

    private suspend fun startOAuth(provider: String, open: (String) -> Unit) {
        val verifier = Crypto.randomToken()
        account.store.putVerifier(AuthFlow.OAuth, verifier)
        try {
            open(auth.authorizeUrl(provider, Crypto.pkce(verifier, AuthFlow.OAuth)))
        } catch (e: Exception) {
            throw AuthException(AuthFailure.ProviderFailed, e) // no browser on the device
        }
    }

    private fun toCodeStep(kind: CodeKind, again: Boolean) {
        codeKind = kind
        step = AuthStep.Code
        code = ""
        sentAt = System.currentTimeMillis()
        sentAgain = again
    }

    private fun launch(action: AuthAction, block: suspend () -> Unit) {
        if (busy != null) return
        if (action == AuthAction.Apple || action == AuthAction.Google) lastProvider = action
        busy = action
        error = null
        notice = null
        viewModelScope.launch {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: AuthException) {
                error = message(e.failure)
            } catch (e: Exception) {
                error = R.string.auth_error_server
            } finally {
                busy = null
            }
        }
    }

    @StringRes
    private fun message(failure: AuthFailure): Int = when (failure) {
        AuthFailure.NoSignal -> R.string.auth_error_signal
        AuthFailure.CodeRejected -> R.string.auth_error_code
        AuthFailure.TooManyRequests -> R.string.auth_error_too_many
        AuthFailure.ServerError -> R.string.auth_error_server
        AuthFailure.WrongPassword -> R.string.auth_error_password
        AuthFailure.SignUpRejected -> R.string.auth_error_signup
        AuthFailure.ProviderFailed -> if (lastProvider == AuthAction.Google) R.string.auth_error_google else R.string.auth_error_apple
        AuthFailure.SessionEnded -> R.string.auth_signed_out
    }
}

/** [authReturn] is a URL MainActivity received (OAuth return or email link); [onReturnHandled] clears it. */
@Composable
fun SignInScreen(account: Account, authReturn: String? = null, onReturnHandled: () -> Unit = {}) {
    val model = viewModel { SignInModel(account) }
    val colors = MyTailLogTheme.colors
    val setup = colors.section(Section.Setup)
    SystemBarIcons(darkStatusIcons = false)
    BackHandler(enabled = model.step != AuthStep.Email) { model.back() }
    LaunchedEffect(Unit) { account.endedNotice.collect { if (it) model.showSignedOutNotice() } }
    LaunchedEffect(authReturn) {
        if (authReturn != null) {
            model.handleReturn(authReturn)
            onReturnHandled()
        }
    }

    BoxWithConstraints(Modifier.fillMaxSize().background(setup.board).imePadding()) {
        val screenHeight = maxHeight // read here: Column's scope blocks the implicit receiver
        val boardHeight = screenHeight * 0.46f
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
                    .heightIn(min = screenHeight - boardHeight)
                    .padding(horizontal = Tokens.Space.s2)
                    .clip(RoundedCornerShape(topStart = Tokens.Radius.s, topEnd = Tokens.Radius.s))
                    .background(colors.leaf)
                    .navigationBarsPadding()
                    .padding(top = Tokens.Space.s6, start = Tokens.Space.s4, end = Tokens.Space.s4, bottom = Tokens.Space.s4),
                verticalArrangement = Arrangement.spacedBy(Tokens.Space.s3),
            ) {
                model.notice?.let { Text(stringResource(it), color = colors.ink, style = MaterialTheme.typography.bodyLarge) }
                when (model.step) {
                    AuthStep.Email -> EmailStep(model)
                    AuthStep.Code -> CodeStep(model)
                    AuthStep.Password, AuthStep.SignUp -> PasswordStep(model)
                    AuthStep.Reset -> ResetStep(model)
                }
                model.error?.let { Text(stringResource(it), color = colors.alarmText, style = MaterialTheme.typography.bodyMedium) }
                if (model.step == AuthStep.Email || model.step == AuthStep.Password) Footer()
            }
        }
    }
}

@Composable
private fun EmailStep(model: SignInModel) {
    val colors = MyTailLogTheme.colors
    val context = LocalContext.current
    val activity = LocalActivity.current
    val idle = model.busy == null
    val open: (String) -> Unit = { openCustomTab(context, it) }
    DButton(
        stringResource(R.string.auth_apple),
        onClick = { model.apple(open) },
        enabled = idle || model.busy == AuthAction.Apple,
        busyText = busyText(model, AuthAction.Apple),
    )
    DButton(
        stringResource(R.string.auth_google),
        onClick = { activity?.let { model.google(it, open) } },
        kind = ButtonKind.Secondary,
        enabled = idle || model.busy == AuthAction.Google,
        busyText = busyText(model, AuthAction.Google),
    )
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
    EmailField(model, ImeAction.Send) { if (model.canSend) model.send() }
    DButton(
        stringResource(R.string.auth_send),
        onClick = { model.send() },
        enabled = model.canSend || model.busy == AuthAction.Send,
        busyText = if (model.busy == AuthAction.Send) stringResource(R.string.auth_sending) else null,
        icon = LucideIcons.Mail,
    )
    DButton(stringResource(R.string.auth_use_password), onClick = { model.go(AuthStep.Password) }, kind = ButtonKind.Quiet, enabled = idle)
}

@Composable
private fun CodeStep(model: SignInModel) {
    val colors = MyTailLogTheme.colors
    Text(stringResource(R.string.auth_check_title), color = colors.ink, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
    if (model.askEmailWithCode) {
        EmailField(model, ImeAction.Next) {}
    } else {
        Text(stringResource(R.string.auth_check_body, model.email.trim()), color = colors.ink, style = MaterialTheme.typography.bodyLarge)
    }
    CodeField(model) { if (model.canVerify) model.verify() }
    DButton(
        stringResource(R.string.auth_sign_in),
        onClick = { model.verify() },
        enabled = model.canVerify || model.busy == AuthAction.Verify,
        busyText = busyText(model, AuthAction.Verify),
    )
    if (!model.askEmailWithCode) ResendRow(model) { model.send(again = true) }
    DButton(stringResource(R.string.auth_different_email), onClick = { model.go(AuthStep.Email) }, kind = ButtonKind.Quiet, enabled = model.busy == null)
}

@Composable
private fun PasswordStep(model: SignInModel) {
    val signUp = model.step == AuthStep.SignUp
    val idle = model.busy == null
    if (signUp) {
        OutlinedTextField(
            value = model.name,
            onValueChange = { model.name = it },
            label = { Text(stringResource(R.string.auth_name_label)) },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge,
            colors = dTextFieldColors(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).semantics { contentType = ContentType.PersonFullName },
        )
    }
    EmailField(model, ImeAction.Next) {}
    PasswordField(model, R.string.auth_password_label, newPassword = signUp) {
        if (signUp && model.canSignUp) model.signUp() else if (!signUp && model.canPassword) model.signInWithPassword()
    }
    if (signUp) {
        DButton(
            stringResource(R.string.auth_create_account),
            onClick = { model.signUp() },
            enabled = model.canSignUp || model.busy == AuthAction.SignUp,
            busyText = busyText(model, AuthAction.SignUp),
        )
        DButton(stringResource(R.string.auth_have_account), onClick = { model.go(AuthStep.Password) }, kind = ButtonKind.Quiet, enabled = idle)
    } else {
        DButton(
            stringResource(R.string.auth_sign_in),
            onClick = { model.signInWithPassword() },
            enabled = model.canPassword || model.busy == AuthAction.Password,
            busyText = busyText(model, AuthAction.Password),
        )
        DButton(stringResource(R.string.auth_create_account), onClick = { model.go(AuthStep.SignUp) }, kind = ButtonKind.Quiet, enabled = idle)
        DButton(
            stringResource(R.string.auth_forgot),
            onClick = { model.forgotPassword() },
            kind = ButtonKind.Quiet,
            enabled = model.canSend || model.busy == AuthAction.Forgot,
            busyText = if (model.busy == AuthAction.Forgot) stringResource(R.string.auth_sending) else null,
        )
    }
    DButton(stringResource(R.string.auth_link_instead), onClick = { model.go(AuthStep.Email) }, kind = ButtonKind.Quiet, enabled = idle)
}

@Composable
private fun ResetStep(model: SignInModel) {
    val colors = MyTailLogTheme.colors
    Text(stringResource(R.string.auth_check_title), color = colors.ink, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
    Text(stringResource(R.string.auth_reset_body, model.email.trim()), color = colors.ink, style = MaterialTheme.typography.bodyLarge)
    CodeField(model) {}
    PasswordField(model, R.string.auth_new_password_label, newPassword = true) { if (model.canReset) model.resetPassword() }
    DButton(
        stringResource(R.string.auth_reset_submit),
        onClick = { model.resetPassword() },
        enabled = model.canReset || model.busy == AuthAction.Reset,
        busyText = busyText(model, AuthAction.Reset),
    )
    ResendRow(model) { model.forgotPassword(again = true) }
    DButton(stringResource(R.string.auth_different_email), onClick = { model.go(AuthStep.Email) }, kind = ButtonKind.Quiet, enabled = model.busy == null)
}

@Composable
private fun busyText(model: SignInModel, action: AuthAction) = if (model.busy == action) stringResource(R.string.auth_signing_in) else null

@Composable
private fun EmailField(model: SignInModel, ime: ImeAction, onIme: () -> Unit) {
    OutlinedTextField(
        value = model.email,
        onValueChange = { model.email = it },
        label = { Text(stringResource(R.string.auth_email_label)) },
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyLarge,
        colors = dTextFieldColors(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ime),
        keyboardActions = KeyboardActions(onAny = { onIme() }),
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).semantics { contentType = ContentType.EmailAddress },
    )
}

@Composable
private fun CodeField(model: SignInModel, onDone: () -> Unit) {
    OutlinedTextField(
        value = model.code,
        onValueChange = { v -> model.code = v.filter(Char::isDigit).take(6) },
        label = { Text(stringResource(R.string.auth_code_label)) },
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyLarge,
        colors = dTextFieldColors(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onAny = { onDone() }),
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).semantics { contentType = ContentType.SmsOtpCode },
    )
}

@Composable
private fun PasswordField(model: SignInModel, @StringRes label: Int, newPassword: Boolean, onDone: () -> Unit) {
    val colors = MyTailLogTheme.colors
    OutlinedTextField(
        value = model.password,
        onValueChange = { model.password = it },
        label = { Text(stringResource(label)) },
        supportingText = if (newPassword) ({ Text(stringResource(R.string.auth_password_rule), color = colors.ink3) }) else null,
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyLarge,
        colors = dTextFieldColors(),
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onAny = { onDone() }),
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).semantics {
            contentType = if (newPassword) ContentType.NewPassword else ContentType.Password
        },
    )
}

/** Quiet "Send it again", enabled 30 s after the last send, then "Sent again at 9:41". */
@Composable
private fun ResendRow(model: SignInModel, resend: () -> Unit) {
    val context = LocalContext.current
    var canResend by remember(model.sentAt) { mutableStateOf(false) }
    LaunchedEffect(model.sentAt) {
        delay((model.sentAt + 30_000 - System.currentTimeMillis()).coerceAtLeast(0))
        canResend = true
    }
    DButton(stringResource(R.string.auth_send_again), onClick = resend, kind = ButtonKind.Quiet, enabled = canResend && model.busy == null)
    if (model.sentAgain) {
        val time = android.text.format.DateFormat.getTimeFormat(context).format(java.util.Date(model.sentAt))
        Text(stringResource(R.string.auth_sent_again, time), color = MyTailLogTheme.colors.ink3, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun Footer() {
    Spacer(Modifier.height(Tokens.Space.s4))
    Text(
        stringResource(R.string.auth_footer),
        color = MyTailLogTheme.colors.ink3,
        style = MaterialTheme.typography.bodyMedium,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
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
