const { expect } = require('chai');
const sinon = require('sinon');

const TranscriptAnalyser = require('../../src/misuse/transcriptAnalyser').TranscriptAnalyser;
const OpenAIHelper = require('../../src/misuse/openaiHelper');

describe('TranscriptAnalyser', function () {
    let analyser;
    let loggerStub;

    beforeEach(() => {
        loggerStub = sinon.stub();
        analyser = new TranscriptAnalyser({}, loggerStub);

        // Stub sendOpenAIRequest globally to avoid real API calls
        sinon.stub(OpenAIHelper, 'sendOpenAIRequest').resolves({
            result: 'mocked result',
            prompt_tokens: 5,
            completion_tokens: 10
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should initialize with default values', function () {
        expect(analyser.promptResults).to.be.an('object');
        expect(analyser.CONFUSED_SENTANCES).to.deep.equal([]);
    });

    it('should run analyseConversation without errors', async function () {
        const timeStamp = Date.now();
        const history = [{ role: 'user', content: 'Test message' }];

        // Stub internal methods to avoid unrelated logic
        sinon.stub(analyser, 'identifyBannedTopics').resolves('mocked result');
        sinon.stub(analyser, 'identifyNonDomainTopics').resolves('mocked result');
        sinon.stub(analyser, 'excludeOKTopics').resolves('mocked result');
        sinon.stub(analyser, 'categoriseResults').resolves(['categorised result']);
        sinon.stub(analyser, 'gradeCatergorisedResults').resolves(['graded result']);

        const result = await analyser.analyseConversation(timeStamp, history);

        expect(result).to.be.an('object');
    });

    it('should convert GPT-4 response to array in gpt4ResponseToArray', function () {
        const input = '"Sentence one"\n"Sentence two"\n"Sentence three"';
        const result = analyser.gpt4ResponseToArray(input);
        expect(result).to.deep.equal(['Sentence one', 'Sentence two', 'Sentence three']);
    });

    it('should verify user messages in verifyUserMessages', async function () {
        const transcript = [
            { role: 'user', content: 'This is a test' },
            { role: 'assistant', content: 'I am here to help' }
        ];
        const nonDomainViolations = ['This is a test'];

        const result = await analyser.verifyUserMessages(transcript, nonDomainViolations);

        expect(result).to.be.a('string');
        expect(result).to.include('This is a test');
    });

    it('should run sympathyDetection without errors', async function () {
        const result = await analyser.sympathyDetection(['mocked message']);

        expect(result).to.equal('mocked result');
    });

    it('should send request and update tokens in sendRequestAndUpdateTokens', async function () {
        const result = await analyser.sendRequestAndUpdateTokens(['mocked message']);

        expect(result).to.equal('mocked result');
        expect(analyser.promptTokensUsed).to.equal(5);
        expect(analyser.completionTokensUsed).to.equal(10);
    });

    it('should grade violation in gradeVolation', async function () {
        const violation = { statement: 'Test violation', type: 'banned', category: 'Test Category' };
        const history = [{ content: 'Test violation' }];

        sinon.stub(analyser, 'callGradeResultsWithRetries').resolves('Severity: High\nReason: Violates policy');

        const result = await analyser.gradeVolation(violation, history);

        expect(result).to.be.an('object');
        expect(result).to.have.property('severity', 'High');
        expect(result).to.have.property('reason', 'Violates policy');
    });

    it('should remove duplicate results', function () {
        const results = [
            { statement: 'Test 1' },
            { statement: 'Test 1' },
            { statement: 'Test 2' }
        ];

        const result = analyser.removeDuplicateResults(results);
        expect(result).to.have.lengthOf(2);
    });

    it('should remove non-applicable severity results', function () {
        const results = [
            { severity: 'High' },
            { severity: 'N/A' },
            { severity: 'Medium' }
        ];

        const result = analyser.removeNonApplicableSeverity(results);
        expect(result).to.have.lengthOf(2);
    });

    it('should check for banned topic violations', function () {
        const bannedTopicsResults = '"Violation 1"\n"Violation 2"';

        const result = analyser.checkBannedTopicViolations(bannedTopicsResults);
        expect(result).to.be.true;
    });

    it('should log results correctly', function () {
        analyser.logResults('Test message', { data: 'some data' }, 'TestFile.txt');

        expect(loggerStub.calledOnce).to.be.true;
        expect(loggerStub.args[0][0]).to.include('Test message');
    });
});
